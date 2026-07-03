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
  return sign + (n * 100).toFixed(2) + "%";
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
  const marketType: "spot" | "perp" | "option" = order.market_type === "spot" ? "spot" : order.market_type === "option" ? "option" : "perp";
  const vipLevel: string = order.vip_level || "普通";
  const orderType: "maker" | "taker" = order.order_type === "maker" ? "maker" : "taker";

  // 期权类型用现货费率表
  const feeTableType: "spot" | "perp" = marketType === "option" ? "spot" : marketType;
  const feeRate = getFeeRate(feeTableType, vipLevel, orderType);
  const effectiveFeeRate = Math.max(0, feeRate); // 负费率（返佣）视为0成本

  const notional = entry * qty;
  const margin = marketType === "spot" || marketType === "option" ? notional : notional / lev;
  const openFee = notional * effectiveFeeRate;

  const closePrice = order.exit_price
    ? parseFloat(order.exit_price)
    : currentPrice;

  let closeFee = 0;
  let pnl: number | null = null;
  let pnlPct: number | null = null;

  if (closePrice && closePrice > 0) {
    const closeNotional = closePrice * qty;
    const closeFeeRate = Math.max(0, getFeeRate(feeTableType, vipLevel, orderType));
    closeFee = closeNotional * closeFeeRate;

    // 期权特殊盈亏计算：
    // 当前价 < 开仓价 → 浮动盈亏 = -权利金（固定亏损）
    // 当前价 >= 开仓价 → 正常计算浮动盈亏
    if (marketType === "option") {
      const premium = order.premium ? parseFloat(order.premium) : 0;
      if (closePrice < entry) {
        // 低于开仓价，固定亏损 = 权利金
        pnl = -premium;
      } else {
        // 高于开仓价，正常计算
        const rawPnl = (closePrice - entry) * qty;
        pnl = rawPnl - openFee - closeFee;
      }
      pnlPct = margin > 0 ? pnl / margin : null;
    } else {
      const rawPnl =
        direction === "long"
          ? (closePrice - entry) * qty
          : (entry - closePrice) * qty;
      pnl = rawPnl - openFee - closeFee;
      pnlPct = margin > 0 ? pnl / margin : null;
    }
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
  marketType: "spot" | "perp" | "option";
  orderType: "maker" | "taker";
  vipLevel: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  leverage: string;
  takeProfit: string;
  stopLoss: string;
  entryDate: string;
  expiryDate: string;
  optionType: "call" | "put";
  optionDirection: "buy_call" | "buy_put" | "sell_call" | "sell_put";
  strikePrice: string;
  premium: string;       // 总权利金（可手动覆盖）
  premiumUnit: string;   // 权利金单价（每张/每币）
  exitDate: string;
  status: "open" | "closed";
  settlementType: "usdt" | "coin";
  contractSize: string;
  impliedVol: string;
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
  expiryDate: "",
  optionType: "call",
  optionDirection: "buy_call" as const,
  strikePrice: "",
  premium: "",
  premiumUnit: "",
  exitDate: "",
  status: "open",
  settlementType: "usdt" as const,
  contractSize: "0.1",
  impliedVol: "",
  note: "",
});

// ===== 订单备注子组件 =====
const OKX_BG_NOTES = "rgba(0,0,0,0.18)";
const OKX_BORDER_NOTES = "rgba(255,255,255,0.07)";

function OrderNotesSection({
  orderId, ledgerId, initialCount, isExpanded, onToggle,
  noteInput, onNoteInputChange,
  editingNoteId, editingNoteContent,
  onStartEdit, onCancelEdit, onEditContentChange,
}: {
  orderId: number;
  ledgerId: number;
  initialCount: number;
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
  // 展开时用实际notes数量，折叠时用initialCount（批量预加载的数量）
  const displayCount = isExpanded ? notes.length : initialCount;
  const addNote = trpc.orderFlow.addNote.useMutation({
    onSuccess: () => {
      onNoteInputChange("");
      utils.orderFlow.getNotes.invalidate({ orderId, ledgerId });
      utils.orderFlow.getNotesCountBatch.invalidate();
    },
  });
  const updateNote = trpc.orderFlow.updateNote.useMutation({
    onSuccess: () => {
      onCancelEdit();
      utils.orderFlow.getNotes.invalidate({ orderId, ledgerId });
    },
  });
  const deleteNote = trpc.orderFlow.deleteNote.useMutation({
    onSuccess: () => {
      utils.orderFlow.getNotes.invalidate({ orderId, ledgerId });
      utils.orderFlow.getNotesCountBatch.invalidate();
    },
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
          {displayCount > 0 && (
            <span
              className="text-xs px-1 rounded"
              style={{ background: "rgba(240,185,11,0.15)", color: OKX_YELLOW }}
            >
              {displayCount}
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

// ===== 管理员用户搜索选择器 =====
function AdminUserPicker({
  value, onChange, defaultUsers
}: {
  value: number;
  onChange: (v: number, name?: string) => void;
  defaultUsers: { user_id: number; username: string; nickname: string; order_count?: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState('全部用户');

  // 实时搜索全平台用户
  const { data: searchResults = [], isFetching } = trpc.orderFlow.adminSearchUsers.useQuery(
    { keyword: search },
    { enabled: search.trim().length >= 1 }
  );

  // 搜索时显示搜索结果，未搜索时显示默认用户列表（按订单数降序前10个）
  const showList = search.trim().length >= 1 ? searchResults : defaultUsers;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={{
          fontSize: '0.6rem', color: '#333333', background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 6px',
          outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
          maxWidth: 90, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>{selectedName}</span>
        <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 999,
          background: '#fff', border: '1px solid rgba(0,0,0,0.15)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          minWidth: 160, maxHeight: 240, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索用户名/昵称..."
              style={{
                width: '100%', fontSize: '0.65rem', border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: 4, padding: '3px 6px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 180 }}>
            {/* 全部用户选项始终显示 */}
            <div
              onClick={() => { onChange(0); setSelectedName('全部用户'); setOpen(false); }}
              style={{
                padding: '6px 10px', fontSize: '0.65rem', cursor: 'pointer',
                background: value === 0 ? 'rgba(184,134,11,0.1)' : 'transparent',
                color: value === 0 ? '#B8860B' : '#333',
                fontWeight: value === 0 ? 600 : 400,
                borderBottom: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              全部用户
            </div>
            {search.trim().length >= 1 && isFetching ? (
              <div style={{ padding: '10px', fontSize: '0.6rem', color: '#999', textAlign: 'center' }}>搜索中...</div>
            ) : showList.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '0.6rem', color: '#999', textAlign: 'center' }}>无匹配用户</div>
            ) : showList.map(u => (
              <div
                key={u.user_id}
                onClick={() => {
                  onChange(u.user_id);
                  setSelectedName(u.nickname || u.username);
                  setOpen(false);
                }}
                style={{
                  padding: '6px 10px', fontSize: '0.65rem', cursor: 'pointer',
                  background: u.user_id === value ? 'rgba(184,134,11,0.1)' : 'transparent',
                  color: u.user_id === value ? '#B8860B' : '#333',
                  fontWeight: u.user_id === value ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div>
                  <span>{u.nickname || u.username}</span>
                  {u.nickname && u.username !== u.nickname && (
                    <span style={{ fontSize: '0.55rem', color: '#999', marginLeft: 4 }}>@{u.username}</span>
                  )}
                </div>
                {'order_count' in u && u.order_count !== undefined && (
                  <span style={{ fontSize: '0.55rem', color: '#aaa', marginLeft: 6 }}>{u.order_count}单</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ===== 主页面 =====
export default function OrderFlowPage() {
  const [, params] = useRoute("/ledger/:id/order-flow");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'parent';
  // 管理员选中的目标用户（0=全部）
  const [adminTargetUserId, setAdminTargetUserId] = useState<number>(0); // 0=全部, >0=指定用户

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
  // USDT/CNY 实时汇率
  const [cnyRate, setCnyRate] = useState<number>(7.28);
  const { data: rateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { staleTime: 1000, refetchInterval: 3000 }
  );
  useEffect(() => {
    if (rateData?.success && rateData.money) {
      const r = parseFloat(rateData.money);
      if (!isNaN(r) && r > 0) setCnyRate(r);
    }
  }, [rateData]);
  // 北京时间实时时钟
  const [bjTime, setBjTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      // 北京时间 = UTC+8
      const bj = new Date(now.getTime() + 8 * 3600 * 1000);
      const mo = String(bj.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(bj.getUTCDate()).padStart(2, '0');
      const hh = String(bj.getUTCHours()).padStart(2, '0');
      const mm = String(bj.getUTCMinutes()).padStart(2, '0');
      const ss = String(bj.getUTCSeconds()).padStart(2, '0');
      setBjTime(`${mo}/${dd} ${hh}:${mm}:${ss}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  // 默认止盈价（来自智能仓位管理目标止盈）
  const [takeProfitModified, setTakeProfitModified] = useState(false); // 是否已手动修改止盈价
  const [premiumModified, setPremiumModified] = useState(false); // 是否已手动修改总权利金
  const { data: defaultTpData } = trpc.orderFlow.getDefaultTakeProfit.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0, staleTime: 5000, refetchInterval: 10000 }
  );
    const defaultTakeProfit = defaultTpData?.targetExitPrice ?? null;
  // 最新资金费率（在form定义后使用，见下方UI状态块）
  const [fundingRate, setFundingRate] = useState<number | null>(null);
  // 订单列表
  const utils = trpc.useUtils();
  // 普通用户：只看自己的订单
  const { data: normalOrders = [], isLoading: normalLoading } = trpc.orderFlow.getOrders.useQuery(
    { ledgerId, status: "all" },
    { enabled: isAuthenticated && ledgerId > 0 && !isAdmin }
  );
  // 管理员专用：获取账本内所有用户列表
  const { data: adminUsers = [] } = trpc.orderFlow.adminGetUsers.useQuery(
    { ledgerId },
    { enabled: isAuthenticated && ledgerId > 0 && isAdmin }
  );
  // 管理员：默认看全部（targetUserId=0），可切换到任意用户
  const { data: adminOrders = [], isLoading: adminLoading } = trpc.orderFlow.adminGetOrders.useQuery(
    { ledgerId, targetUserId: adminTargetUserId, status: 'all' },
    { enabled: isAuthenticated && ledgerId > 0 && isAdmin }
  );
  const orders = isAdmin ? adminOrders : normalOrders;
  const isLoading = isAdmin ? adminLoading : normalLoading;

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
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OrderFormData>(defaultForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [filterMarket, setFilterMarket] = useState<"all" | "option" | "perp" | "spot">("all");
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
  // 期权总权利金自动计算：开仓价（权利金单价）× 数量 × 面值
  useEffect(() => {
    if (form.marketType !== "option" || premiumModified) return;
    const unit = parseFloat(form.entryPrice); // 期权模式下开仓价=权利金单价
    const qty = parseFloat(form.quantity);
    const size = parseFloat(form.contractSize);
    if (unit > 0 && qty > 0 && size > 0) {
      const total = unit * qty * size;
      setForm(f => ({ ...f, premium: String(Math.round(total * 100) / 100) }));
    } else {
      setForm(f => ({ ...f, premium: "" }));
    }
  }, [form.entryPrice, form.quantity, form.contractSize, form.marketType, premiumModified]);

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
    let result = orders as any[];
    if (filterStatus !== "all") result = result.filter((o: any) => o.status === filterStatus);
    if (filterMarket !== "all") result = result.filter((o: any) => o.market_type === filterMarket);
    return result;
  }, [orders, filterStatus, filterMarket]);

  // 汇总计算（基于当前筛选结果）
  const summary = useMemo(() => {
    let totalCost = 0;      // 总成本（保证金）
    let totalNotional = 0;  // 总名义价值
    let pnlCount = 0;       // 有有效盈亏的订单数
    let spotCount = 0;      // 现货订单数
    let perpCount = 0;      // 合约订单数
    let optionCount = 0;    // 期权订单数
    let spotQty = 0;        // 现货ETH数量
    let perpQty = 0;        // 合约ETH数量
    let optionQty = 0;      // 期权ETH数量
    let spotCostSum = 0;    // 现货加权成本（entry_price × qty 之和）
    let perpCostSum = 0;    // 合约加权成本
    let optionCostSum = 0;  // 期权加权成本（用 strike_price）
    let totalFeeSum = 0;    // 所有订单手续费之和
    for (const order of filteredOrders as any[]) {
      const oPrice = getPriceForSymbol(order.symbol || 'ETHUSDT');
      const calc = calcOrder(order, oPrice, fundingRate);
      totalCost += calc.margin;
      totalNotional += calc.notional;
      if (calc.pnl != null) pnlCount++;
      const qty = parseFloat(order.quantity) || 0;
      const ep = parseFloat(order.entry_price) || 0;
      // 手续费：开仓 + 平仓（简化：2 倍开仓费率）
      const feeTableType: "spot" | "perp" = order.market_type === "option" ? "spot" : (order.market_type === "spot" ? "spot" : "perp");
      const feeRate = Math.max(0, getFeeRate(feeTableType, order.vip_level || "普通", order.order_type === "maker" ? "maker" : "taker"));
      totalFeeSum += ep * qty * feeRate * 2; // 开仓+平仓
      // 按类型统计
      if (order.market_type === 'spot') { spotCount++; spotQty += qty; spotCostSum += ep * qty; }
      else if (order.market_type === 'option') {
        optionCount++; optionQty += qty;
        // 期权均价用执行价（strike_price）加权
        const sp = order.strike_price ? parseFloat(order.strike_price) : ep;
        optionCostSum += sp * qty;
      }
      else { perpCount++; perpQty += qty; perpCostSum += ep * qty; }
    }
    const totalQty = spotQty + perpQty + optionQty;
    // 加权均价
    const perpAvg = perpQty > 0 ? perpCostSum / perpQty : null;
    const spotAvg = spotQty > 0 ? spotCostSum / spotQty : null;
    const optionAvg = optionQty > 0 ? optionCostSum / optionQty : null;
    const totalAvg = totalQty > 0 ? (perpCostSum + spotCostSum + optionCostSum) / totalQty : null;
    // 浮动盈亏：统一用现货视角（当前价 - 加权均价）× 总持仓量 - 手续费
    // 各类型分别用各自的当前价和均价计算
    let totalPnl = 0;
    for (const order of filteredOrders as any[]) {
      const oPrice = getPriceForSymbol(order.symbol || 'ETHUSDT');
      if (!oPrice) continue;
      const qty = parseFloat(order.quantity) || 0;
      const ep = parseFloat(order.entry_price) || 0;
      const feeTableType: "spot" | "perp" = order.market_type === "option" ? "spot" : (order.market_type === "spot" ? "spot" : "perp");
      const feeRate = Math.max(0, getFeeRate(feeTableType, order.vip_level || "普通", order.order_type === "maker" ? "maker" : "taker"));
      const fee = ep * qty * feeRate * 2;
      if (order.market_type === 'option') {
        // 期权：用执行价作为买入均价
        const sp = order.strike_price ? parseFloat(order.strike_price) : ep;
        totalPnl += (oPrice - sp) * qty - fee;
      } else {
        // 合约/现货：统一用现货多单视角
        totalPnl += (oPrice - ep) * qty - fee;
      }
    }
    // 盈亏比例：用买入总价值（均价 × 总持仓量）作分母，直观反映涨跌幅
    const totalBuyCost = (perpCostSum + spotCostSum + optionCostSum); // 均价×数量之和
    const pnlPct = totalBuyCost > 0 ? totalPnl / totalBuyCost : null;
    return { totalCost, totalNotional, totalPnl, pnlPct, count: filteredOrders.length, pnlCount, spotCount, perpCount, optionCount, spotQty, perpQty, optionQty, totalQty, perpAvg, spotAvg, optionAvg, totalAvg };
  }, [filteredOrders, cryptoPricesRaw, fundingRate]);

  // 批量获取所有订单的备注数量（页面加载时就显示徽章）
  const orderIds = useMemo(() => (orders as any[]).map((o: any) => o.id), [orders]);
  const { data: notesCountMap = {} } = trpc.orderFlow.getNotesCountBatch.useQuery(
    { orderIds, ledgerId },
    { enabled: isAuthenticated && ledgerId > 0 && orderIds.length > 0, staleTime: 30000 }
  );

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
      expiryDate: order.expiry_date || "",
      optionType: (order.option_type as "call" | "put") || "call",
      optionDirection: (
        order.direction === "long" && order.option_type === "call" ? "buy_call" :
        order.direction === "long" && order.option_type === "put" ? "buy_put" :
        order.direction === "short" && order.option_type === "call" ? "sell_call" :
        "sell_put"
      ) as "buy_call" | "buy_put" | "sell_call" | "sell_put",
      strikePrice: order.strike_price ? String(order.strike_price) : "",
      premium: order.premium ? String(order.premium) : "",
      premiumUnit: order.premium_unit ? String(order.premium_unit) : "",
      exitDate: order.exit_date || "",
      status: order.status || "open",
      settlementType: (order.settlement_type as "usdt" | "coin") || "usdt",
      contractSize: order.contract_size ? String(order.contract_size) : "0.1",
      impliedVol: order.implied_vol ? String(order.implied_vol) : "",
      note: order.note || "",
    });
    const tp = order.take_profit ? String(order.take_profit) : "";
    const isDefaultTp = defaultTakeProfit && tp === String(defaultTakeProfit);
    setTakeProfitModified(!isDefaultTp && tp !== "");
    setPremiumModified(order.premium_unit != null); // 编辑时若有单价则视为手动模式
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
      expiryDate: form.expiryDate || undefined,
      optionType: form.marketType === "option" ? form.optionType : undefined,
      strikePrice: form.marketType === "option" && form.strikePrice ? parseFloat(form.strikePrice) : undefined,
      premium: form.premium ? parseFloat(form.premium) : undefined,
      premiumUnit: form.marketType === "option" && form.premiumUnit ? parseFloat(form.premiumUnit) : undefined,
      settlementType: form.marketType === "option" ? form.settlementType : undefined,
      contractSize: form.marketType === "option" && form.contractSize ? parseFloat(form.contractSize) : undefined,
      impliedVol: form.marketType === "option" && form.impliedVol ? parseFloat(form.impliedVol) : undefined,
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
  const previewFeeRate = getFeeRate(form.marketType === "option" ? "spot" : form.marketType, form.vipLevel, form.orderType);

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

        <div className="flex-1 min-w-0 relative flex items-center gap-2">
          <button
            onClick={() => setShowPageMenu((v: boolean) => !v)}
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
          {isAdmin && (
            <AdminUserPicker
              value={adminTargetUserId}
              onChange={setAdminTargetUserId}
              defaultUsers={adminUsers}
            />
          )}
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
                style={{ color: "#c0c0c0", backgroundColor: "rgba(240,185,11,0.08)" }}
                onClick={() => setShowPageMenu(false)}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                订单流管理
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#c0c0c0" }}
                onClick={() => { setShowPageMenu(false); setLocation(`/ledger/${ledgerId}/option-analysis`); }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
                期权分析总览
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== 状态过滤 Tab ===== */}
      <div className="flex gap-2 px-4 pt-3 pb-1 items-center">
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
      {/* ===== 市场类型过滤 ===== */}
      <div className="flex gap-2 px-4 pb-2 items-center">
        {(["all", "option", "perp", "spot"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setFilterMarket(m)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={
              filterMarket === m
                ? { backgroundColor: "rgba(14,203,129,0.15)", color: "#0ECB81", border: `1px solid rgba(14,203,129,0.4)` }
                : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
            }
          >
            {m === "all" ? "全类型" : m === "option" ? "期权" : m === "perp" ? "永续" : "现货"}
          </button>
        ))}
      </div>

      {/* ===== 汇总栏 ===== */}
      {!isLoading && summary.count > 0 && (
        <div
          className="mx-3 mb-3 rounded-2xl overflow-hidden"
          style={{
            position: 'relative',
            borderRadius: '16px',
            border: '1.5px solid rgba(180,185,195,0.8)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(140,145,155,0.5)',
            background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 2px), linear-gradient(160deg, #e2e4e8 0%, #c8cace 20%, #d8dadd 40%, #bfc1c6 60%, #d2d4d8 80%, #e0e2e6 100%)',
          }}
        >
          {/* 四角铆钉 */}
          {[{top:'5px',left:'6px'},{top:'5px',right:'6px'},{bottom:'5px',left:'6px'},{bottom:'5px',right:'6px'}].map((pos, i) => (
            <div key={i} style={{ position:'absolute', width:'5px', height:'5px', borderRadius:'50%', zIndex:10, ...pos,
              background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #d8dadd 35%, #a0a4aa 65%, #707478 100%)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)' }} />
          ))}
          {/* 顶部标题行 */}
          <div
            className="flex items-center justify-between px-4 pt-2.5 pb-1"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="text-xs font-semibold" style={{ color: '#222222', letterSpacing: '0.05em' }}>持仓汇总</span>
              {/* 显示当前查看的用户名 */}
              {isAdmin && adminTargetUserId === 0 ? (
                <span style={{ fontSize: '0.55rem', color: '#B8860B', fontWeight: 600, background: 'rgba(184,134,11,0.1)', borderRadius: 4, padding: '1px 5px' }}>全部用户</span>
              ) : isAdmin && adminTargetUserId > 0 ? (
                <span style={{ fontSize: '0.55rem', color: '#555', fontWeight: 600, background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '1px 5px' }}>
                  {adminUsers.find((u: any) => u.user_id === adminTargetUserId)?.nickname ||
                   adminUsers.find((u: any) => u.user_id === adminTargetUserId)?.username ||
                   `UID:${adminTargetUserId}`}
                </span>
              ) : (
                <span style={{ fontSize: '0.55rem', color: '#555', fontWeight: 600, background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '1px 5px' }}>
                  {user?.name || user?.username || ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {currentPrice && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#B8860B', fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  ETH {fmt(currentPrice, 1)}
                </span>
              )}
              {bjTime && (
                <span style={{ fontSize: '0.55rem', color: '#666666', fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  {bjTime}
                </span>
              )}
            </div>
          </div>
          {/* 类型统计 + ETH数量：表格布局 */}
          <div style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <th style={{ padding: "5px 12px", textAlign: "center", fontWeight: 600, color: '#333333', borderRight: "1px solid rgba(0,0,0,0.08)", letterSpacing: '0.05em' }}>
                    合约{summary.perpCount > 0 && <span style={{ color: '#444444', fontSize: '0.6rem', fontWeight: 400, marginLeft: 2 }}>{summary.perpCount}单</span>}
                  </th>
                  <th style={{ padding: "5px 12px", textAlign: "center", fontWeight: 600, color: '#333333', borderRight: "1px solid rgba(0,0,0,0.08)", letterSpacing: '0.05em' }}>
                    现货{summary.spotCount > 0 && <span style={{ color: '#444444', fontSize: '0.6rem', fontWeight: 400, marginLeft: 2 }}>{summary.spotCount}单</span>}
                  </th>
                  <th style={{ padding: "5px 12px", textAlign: "center", fontWeight: 600, color: '#333333', borderRight: "1px solid rgba(0,0,0,0.08)", letterSpacing: '0.05em' }}>
                    期权{summary.optionCount > 0 && <span style={{ color: '#444444', fontSize: '0.6rem', fontWeight: 400, marginLeft: 2 }}>{summary.optionCount}单</span>}
                  </th>
                  <th style={{ padding: "5px 12px", textAlign: "center", fontWeight: 600, color: '#333333', letterSpacing: '0.05em' }}>
                    合计<span style={{ color: '#B8860B', fontSize: '0.6rem', fontWeight: 700, marginLeft: 2 }}>{summary.count}单</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    <span style={{ color: '#000000', fontWeight: 700 }}>{Math.floor(summary.perpQty)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> ETH</span>
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    <span style={{ color: '#000000', fontWeight: 700 }}>{Math.floor(summary.spotQty)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> ETH</span>
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    <span style={{ color: '#000000', fontWeight: 700 }}>{Math.floor(summary.optionQty)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> ETH</span>
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center" }}>
                    <span style={{ color: '#B8860B', fontWeight: 700 }}>{Math.floor(summary.totalQty)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> ETH</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    {summary.perpAvg != null
                      ? <><span style={{ color: '#000000', fontWeight: 700 }}>{fmt(summary.perpAvg, 0)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> 均价</span></>
                      : <span style={{ color: '#888888' }}>-</span>}
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    {summary.spotAvg != null
                      ? <><span style={{ color: '#000000', fontWeight: 700 }}>{fmt(summary.spotAvg, 0)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> 均价</span></>
                      : <span style={{ color: '#888888' }}>-</span>}
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                    {summary.optionAvg != null
                      ? <><span style={{ color: '#000000', fontWeight: 700 }}>{fmt(summary.optionAvg, 0)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> 均价</span></>
                      : <span style={{ color: '#888888' }}>-</span>}
                  </td>
                  <td style={{ padding: "5px 12px", textAlign: "center" }}>
                    {summary.totalAvg != null
                      ? <><span style={{ color: '#B8860B', fontWeight: 700 }}>{fmt(summary.totalAvg, 0)}</span><span style={{ color: '#444444', fontSize: '0.6rem' }}> 均价</span></>
                      : <span style={{ color: '#888888' }}>-</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* 主数据行：三列 */}
          <div className="flex items-stretch py-3" style={{ paddingLeft: 0, paddingRight: 0 }}>
            {/* 左：订单价值 */}
            <div style={{ flex: 1, textAlign: "center", padding: "0 12px", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
              <div className="text-xs mb-1" style={{ color: '#333333', letterSpacing: '0.05em' }}>订单价值</div>
              <div
                className="text-base font-bold"
                style={{
                  color: '#000000',
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {fmt(summary.totalNotional, 0)}<span style={{ fontSize: 10, color: '#444444', fontWeight: 400, marginLeft: 1 }}>U</span>
              </div>
            </div>

            {/* 右：总浮动盈亏 */}
            <div style={{ flex: 1, textAlign: "center", padding: "0 12px" }}>
              <div className="text-xs mb-1 flex items-center justify-center gap-1" style={{ color: '#333333', letterSpacing: '0.05em', whiteSpace: "nowrap", flexWrap: "nowrap" }}>
                浮动盈亏
                {summary.pnlPct != null && (
                  <span
                    style={{
                      color: summary.totalPnl >= 0 ? '#A80000' : '#16a34a',
                      fontFamily: "Inter, -apple-system, sans-serif",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {summary.totalPnl >= 0 ? "+" : ""}{(summary.pnlPct * 100).toFixed(2)}%
                  </span>
                )}
                <span
                  onClick={() => alert('合约/现货：\n(当前价 - 开仓价) × 数量 - 手续费\n\n期权：\n用执行价作为买入均价，(当前价 - 执行价) × 数量 - 手续费\n\n比例 = 浮动盈亏 ÷ (均价 × 总持仓量)')}
                  style={{ cursor: "pointer", color: '#999999', fontSize: 13, lineHeight: 1, userSelect: "none" }}
                >ⓘ</span>
              </div>
              <div
                className="text-base font-bold"
                style={{
                  color: summary.totalPnl >= 0 ? '#A80000' : '#16a34a',
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                  textAlign: "center",
                }}
              >
                {summary.totalPnl >= 0 ? "+" : ""}{fmt(summary.totalPnl, 0)}<span style={{ fontSize: 10, color: '#555555', fontWeight: 400, marginLeft: 1 }}>U</span>
              </div>
            </div>
          </div>
          {/* 止盈价格 + 到期盈利行 */}
          {(() => {
            const tp = defaultTakeProfit ?? null;
            const tpPnl = tp != null && summary.totalAvg != null && summary.totalQty > 0
              ? (tp - summary.totalAvg) * summary.totalQty
              : null;
            const tpPct = tpPnl != null && summary.totalAvg != null && summary.totalQty > 0
              ? tpPnl / (summary.totalAvg * summary.totalQty)
              : null;
            return (
              <div
                className="flex items-stretch py-2"
                style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingLeft: 0, paddingRight: 0 }}
              >
                {/* 左：止盈价格 */}
                <div style={{ flex: 1, textAlign: "center", padding: "0 12px", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                  <div className="text-xs mb-0.5" style={{ color: '#333333', letterSpacing: '0.05em' }}>止盈价格</div>
                  <div style={{ fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {tp != null
                      ? <span style={{ color: '#B8860B', fontWeight: 700, fontSize: '0.95rem' }}>{fmt(tp, 0)}<span style={{ fontSize: 10, color: '#444444', fontWeight: 400, marginLeft: 1 }}>U</span></span>
                      : <span style={{ color: '#888888', fontSize: '0.85rem' }}>-</span>}
                  </div>
                  {tp != null && currentPrice != null && (() => {
                    const diff = tp - currentPrice;
                    const pct = diff / currentPrice * 100;
                    const isUp = diff >= 0;
                    return (
                      <div style={{ fontSize: '0.6rem', color: '#222222', marginTop: 2, fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                        还需{isUp ? '涨' : '跌'} {isUp ? '+' : ''}{fmt(diff, 0)}点 {isUp ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                    );
                  })()}
                </div>
                {/* 右：到期盈利 */}
                <div style={{ flex: 1, textAlign: "center", padding: "0 12px" }}>
                  <div className="text-xs mb-0.5 flex items-center justify-center gap-1" style={{ color: '#333333', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    到期盈利
                    {tpPct != null && (
                      <span style={{ color: tpPnl! >= 0 ? '#A80000' : '#16a34a', fontSize: '0.65rem', fontWeight: 600 }}>
                        {tpPnl! >= 0 ? '+' : ''}{(tpPct * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {tpPnl != null
                      ? <span style={{ color: tpPnl >= 0 ? '#A80000' : '#16a34a', fontWeight: 700, fontSize: '0.95rem' }}>
                          {tpPnl >= 0 ? '+' : ''}{fmt(tpPnl, 0)}<span style={{ fontSize: 10, color: '#444444', fontWeight: 400, marginLeft: 1 }}>U</span>
                        </span>
                      : <span style={{ color: '#888888', fontSize: '0.85rem' }}>-</span>}
                  </div>
                  {tpPnl != null && (
                    <div style={{ fontSize: '0.6rem', color: '#222222', marginTop: 2, fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                      ≈¥{Math.round(tpPnl * cnyRate).toLocaleString('zh-CN')}元
                      <span style={{ color: '#888888', marginLeft: 3 }}>实时汇率 {cnyRate.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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
          const isPerp = order.market_type === "perp";
          const isOption = order.market_type === "option";
          // 期权到期倒计时
          let expiryDaysLeft: number | null = null;
          if (isOption && order.expiry_date) {
            const expiry = new Date(order.expiry_date);
            const now = new Date();
            const diffMs = expiry.getTime() - now.getTime();
            expiryDaysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          }
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
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: isOption ? "rgba(147,51,234,0.12)" : "rgba(240,185,11,0.08)", color: isOption ? "#a78bfa" : OKX_TEXT_SEC }}>
                  {isPerp ? "永续" : isOption ? "期权" : "现货"}
                </span>
                {isOption && expiryDaysLeft != null && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: expiryDaysLeft <= 3 ? "rgba(246,70,93,0.15)" : "rgba(14,203,129,0.12)", color: expiryDaysLeft <= 3 ? "#F6465D" : "#0ECB81" }}>
                    {expiryDaysLeft > 0 ? `${expiryDaysLeft}天到期` : "已到期"}
                  </span>
                )}
                {/* 开仓日期 + 订单编号 */}
                <div className="flex flex-col leading-tight">
                  {isOpen ? (
                    <span style={{ color: OKX_TEXT_SEC, fontSize: '0.6rem' }}>{order.entry_date}</span>
                  ) : (
                    <>
                      <span style={{ color: OKX_TEXT_SEC, fontSize: '0.6rem' }}>{order.entry_date}</span>
                      {order.exit_date && <span style={{ color: OKX_TEXT_SEC, fontSize: '0.6rem' }}>{order.exit_date}</span>}
                    </>
                  )}
                  {(order as any).order_no && (
                    <span style={{ color: '#aaaaaa', fontSize: '0.55rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                      {(order as any).order_no}
                    </span>
                  )}
                </div>

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
                    {fmt(parseFloat(order.entry_price), 1)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>
                    {isOpen ? "最新价" : "平仓价"}
                  </div>
                  <div className="text-base font-bold" style={{ color: isOpen ? OKX_YELLOW : OKX_TEXT_SEC, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {isOpen
                      ? orderPrice ? fmt(orderPrice, 1) : "--"
                      : order.exit_price ? fmt(parseFloat(order.exit_price), 1) : "--"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>
                    {isOpen ? "浮动盈亏" : "实现盈亏"}
                  </div>
                  <div className="text-base font-bold" style={{ color: pnlColor, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {calc.pnl != null ? `${calc.pnl >= 0 ? "+" : "-"}${fmt(Math.abs(calc.pnl), 2)}` : "--"}
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
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>ETH数量</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(parseFloat(order.quantity), 2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>{isPerp ? "保证金" : isOption ? "权利金" : "成本"}</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {isOption && order.premium
                      ? `${Math.round(parseFloat(order.premium)).toLocaleString("zh-CN")} U`
                      : <>{fmt(calc.margin, 2)}<span style={{ fontSize: '0.6rem', color: OKX_TEXT_SEC, marginLeft: 1 }}>U</span></>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>订单价値</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(calc.notional, 0)}<span style={{ fontSize: '0.6rem', color: OKX_TEXT_SEC, marginLeft: 1 }}>U</span>
                  </div>
                </div>
              </div>

              {/* 期权专属信息行：行权价 / 盈亏平衡价 / 最大亏损 / 最大盈利 */}
              {isOption && (
                <div className="px-3 py-2 space-y-1.5" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                  {/* 第一行：合约类型 + 行权价 + 到期日 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {order.option_type && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: order.option_type === "call" ? "rgba(14,203,129,0.15)" : "rgba(246,70,93,0.15)",
                          color: order.option_type === "call" ? "#0ECB81" : "#F6465D",
                        }}
                      >
                        {order.option_type === "call" ? "CALL" : "PUT"}
                      </span>
                    )}
                    {order.strike_price && (
                      <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>
                        行权价 <span style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>${parseFloat(order.strike_price).toLocaleString("zh-CN")}</span>
                      </span>
                    )}
                    {order.expiry_date && (
                      <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>
                        到期 <span style={{ color: OKX_TEXT_PRI }}>{order.expiry_date?.slice(0, 10)}</span>
                      </span>
                    )}
                  </div>
                  {/* 第二行：盈亏平衡价 / 最大亏损 / 最大盈利 */}
                  {(() => {
                    const strike = order.strike_price ? parseFloat(order.strike_price) : null;
                    const premium = order.premium ? parseFloat(order.premium) : null;
                    const qty = parseFloat(order.quantity || "0");
                    const isLongDir = order.direction === "long";
                    const optType = order.option_type;

                    // 盈亏平衡价（到期）
                    let breakeven: number | null = null;
                    if (strike != null && premium != null && qty > 0) {
                      const premiumPerUnit = premium / qty;
                      if (optType === "call") {
                        breakeven = isLongDir ? strike + premiumPerUnit : strike - premiumPerUnit;
                      } else {
                        breakeven = isLongDir ? strike - premiumPerUnit : strike + premiumPerUnit;
                      }
                    }

                    // 最大亏损（买入方：权利金；卖出方：理论上无限，显示"无限"）
                    const maxLoss = isLongDir
                      ? (premium != null ? Math.round(premium) : null)
                      : null; // 卖出方无限亏损

                    // 最大盈利（买入 Call：无限；买入 Put：(strike - 0) * qty - premium）
                    let maxProfit: number | null | "无限" = null;
                    if (isLongDir && strike != null && premium != null) {
                      if (optType === "call") {
                        maxProfit = "无限";
                      } else {
                        maxProfit = Math.round(strike * qty - premium);
                      }
                    } else if (!isLongDir && premium != null) {
                      maxProfit = Math.round(premium); // 卖出方最大盈利 = 权利金
                    }

                    return (
                      <div className="grid grid-cols-3 gap-0">
                        <div>
                          <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>盈亏平衡</div>
                          <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            {breakeven != null ? `$${breakeven.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}` : "--"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大亏损</div>
                          <div className="text-sm" style={{ color: "#F6465D", fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            {isLongDir
                              ? (maxLoss != null ? `-${maxLoss.toLocaleString("zh-CN")} U` : "--")
                              : <span style={{ color: "#F6465D", fontSize: "0.7rem" }}>理论无限</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大盈利</div>
                          <div className="text-sm" style={{ color: "#0ECB81", fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            {maxProfit === "无限"
                              ? <span style={{ color: "#0ECB81", fontSize: "0.7rem" }}>理论无限</span>
                              : maxProfit != null ? `+${(maxProfit as number).toLocaleString("zh-CN")} U` : "--"}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
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
                  // 止盈利润 = 毛利润，不扣手续费和资金费
                  const rawPnl = isLongDir ? (targetPrice - entry) * qty : (entry - targetPrice) * qty;
                  return rawPnl;
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
                            <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>止盈 {fmt(tpPrice, 1)}</span>
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
                            止盈利润 {net >= 0 ? "+" : ""}{fmt(net, 2)}
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
                            <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>止损 {fmt(slPrice, 1)}</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: net >= 0 ? OKX_GREEN : OKX_RED, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            预计净亏损 {net >= 0 ? "+" : ""}{fmt(net, 2)}
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
                {/* 盈亏平衡 + ℹ️明细弹窗 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>盈亏平衡 {fmt(calc.breakEven, 2)}</span>
                  <button
                    onClick={() => {
                      const rawPnl = calc.pnl != null ? (calc.pnl + calc.totalFee + (calc.fundingCost ?? 0)) : null;
                      const lines = [
                        `持仓盈亏：${rawPnl != null ? (rawPnl >= 0 ? '+' : '') + fmt(rawPnl, 2) + ' U' : '--'}`,
                        `开仓手续费：-${fmt(calc.openFee, 2)} U`,
                        `平仓手续费（预估）：-${fmt(calc.closeFee, 2)} U`,
                        isPerp && calc.fundingCost != null ? `资金费累计：${calc.fundingCost >= 0 ? '-' : '+'}${fmt(Math.abs(calc.fundingCost), 2)} U` : null,
                        `──────────`,
                        `止盈利润：${rawPnl != null ? (rawPnl >= 0 ? '+' : '') + fmt(rawPnl, 2) + ' U' : '--'}`,
                      ].filter(Boolean).join('\n');
                      alert(lines);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: OKX_TEXT_SEC, fontSize: '0.7rem', lineHeight: 1 }}
                  >
                    ⓘ
                  </button>
                </div>
              </div>

              {/* 行6：多条备注区域（可折叠） */}
              <OrderNotesSection
                orderId={order.id}
                ledgerId={ledgerId}
                initialCount={(notesCountMap as any)[order.id] ?? 0}
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
                  onChange={(e) => setForm((f) => ({ ...f, marketType: e.target.value as "perp" | "spot" | "option" }))}
                  className="w-full px-2 py-2 rounded-xl text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI }}
                >
                  <option value="perp">永续合约</option>
                  <option value="spot">现货</option>
                  <option value="option">期权</option>
                </select>
              </div>
              {/* 方向（非期权） */}
              {form.marketType !== "option" && (
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
              )}
            </div>

            {/* 期权四选一方向按钮组（仅期权） */}
            {form.marketType === "option" && (
              <div className="mb-4">
                <label className="block text-xs mb-2" style={{ color: OKX_TEXT_SEC }}>方向 / 类型</label>
                <div className="space-y-2">
                  {([
                    { id: "buy_call" as const, label: "买Call", desc: "看涨 · 付权利金 · 无限盈利", color: "#0ECB81", bg: "rgba(14,203,129,0.15)", border: "rgba(14,203,129,0.4)" },
                    { id: "buy_put" as const, label: "买Put", desc: "看跌 · 付权利金 · 有限盈利", color: "#F6465D", bg: "rgba(246,70,93,0.15)", border: "rgba(246,70,93,0.4)" },
                    { id: "sell_call" as const, label: "卖Call", desc: "看跌/中性 · 收权利金 · 无限风险", color: "#0ECB81", bg: "rgba(14,203,129,0.15)", border: "rgba(14,203,129,0.4)" },
                    { id: "sell_put" as const, label: "卖Put", desc: "看涨/中性 · 收权利金 · 有限风险", color: "#F6465D", bg: "rgba(246,70,93,0.15)", border: "rgba(246,70,93,0.4)" },
                  ]).map(({ id, label, desc, color, bg, border: btnBorder }) => {
                    const isSelected = form.optionDirection === id;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          const direction = id.startsWith("buy") ? "long" : "short";
                          const optionType = id.endsWith("call") ? "call" : "put";
                          setForm((f) => ({ ...f, optionDirection: id, direction, optionType }));
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all"
                        style={
                          isSelected
                            ? { backgroundColor: bg, border: `1px solid ${btnBorder}` }
                            : { backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${OKX_BORDER}` }
                        }
                      >
                        <span
                          className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{
                            minWidth: "3rem",
                            textAlign: "center",
                            backgroundColor: isSelected ? bg : "rgba(255,255,255,0.06)",
                            color: isSelected ? color : OKX_TEXT_SEC,
                            border: `1px solid ${isSelected ? btnBorder : OKX_BORDER}`,
                          }}
                        >
                          {label}
                        </span>
                        <span className="text-xs" style={{ color: isSelected ? OKX_TEXT_PRI : OKX_TEXT_SEC }}>
                          {desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

                        {/* VIP等级 + 挂单类型 + 手续费率（一行三列） */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {/* VIP等级 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>VIP</label>
                <select
                  value={form.vipLevel}
                  onChange={(e) => setForm((f) => ({ ...f, vipLevel: e.target.value }))}
                  className="w-full px-2 py-2 rounded-xl text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI }}
                >
                  {VIP_LEVELS.map((v) => (
                    <option key={v} value={v} style={{ background: "#1a1a1a", color: OKX_TEXT_PRI }}>{v}</option>
                  ))}
                </select>
              </div>
              {/* 挂单类型 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>挂单</label>
                <select
                  value={form.orderType}
                  onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value as "taker" | "maker" }))}
                  className="w-full px-2 py-2 rounded-xl text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI }}
                >
                  <option value="taker">市价(Taker)</option>
                  <option value="maker">限价(Maker)</option>
                </select>
              </div>
              {/* 手续费率预览 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>手续费率</label>
                <div
                  className="w-full px-2 py-2 rounded-xl text-sm flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${OKX_BORDER}`, color: previewFeeRate < 0 ? OKX_GREEN : OKX_YELLOW, fontWeight: 600 }}
                >
                  {previewFeeRate < 0 ? "返" : ""}{(previewFeeRate * 100).toFixed(4)}%
                </div>
              </div>
            </div>

            {/* 数字输入字段 */}
            {[
              { label: form.marketType === "option" ? "开仓价（权利金单价）" : "开仓价 (USDT)", key: "entryPrice", placeholder: form.marketType === "option" ? "如 149.5（OKX显示的开仓均价）" : "如 2500.00" },
              { label: "数量 (ETH)", key: "quantity", placeholder: "如 0.5" },
              ...(form.marketType === "perp" ? [{ label: "杠杆倍数", key: "leverage", placeholder: "如 5" }] : []),
              ...(form.marketType !== "option" ? [{ label: "止损价 (可选)", key: "stopLoss", placeholder: "如 2200" }] : []),
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
            {/* 止盈价（带默认值跟踪，期权不显示） */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs" style={{ color: OKX_TEXT_SEC }}>止盈价 (可选)</label>
                <button
                  type="button"
                  onClick={async () => {
                    if (takeProfitModified) {
                      // 当前是“手动”状态，点击切换回“默认”，拉取最新数据
                      await utils.orderFlow.getDefaultTakeProfit.invalidate();
                      // invalidate后等待refetch完成，用当前缓存的defaultTakeProfit
                      const tp = defaultTakeProfit;
                      if (tp) setForm(f => ({ ...f, takeProfit: String(tp) }));
                      setTakeProfitModified(false);
                    } else {
                      // 当前是“默认”状态，点击切换为“手动”，清空输入框让用户自己输入
                      setForm(f => ({ ...f, takeProfit: '' }));
                      setTakeProfitModified(true);
                    }
                  }}
                  className="text-xs px-2 py-0.5 rounded font-bold"
                  style={{
                    backgroundColor: takeProfitModified ? "rgba(240,185,11,0.15)" : "rgba(76,175,80,0.15)",
                    color: takeProfitModified ? OKX_YELLOW : "#4CAF50",
                    border: `1px solid ${takeProfitModified ? OKX_YELLOW : "#4CAF50"}`,
                  }}
                >
                  {takeProfitModified ? "\u624b\u52a8" : "\u9ed8\u8ba4"}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={form.takeProfit}
                onChange={(e) => {
                  setForm(f => ({ ...f, takeProfit: e.target.value }));
                  // 只要用户输入了内容，自动切换为“手动”状态
                  if (e.target.value !== "" && e.target.value !== String(defaultTakeProfit)) {
                    setTakeProfitModified(true);
                  }
                }}
                placeholder={defaultTakeProfit ? `\u9ed8\u8ba4 ${defaultTakeProfit}` : "\u5982 3000"}
                className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${takeProfitModified ? OKX_YELLOW : "#4CAF50"}`,
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

            {/* 到期日期（仅期权） */}
            {form.marketType === "option" && (
              <div className="mb-3">
                <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>到期日期</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
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
            )}


            {/* 行权价（仅期权） */}
            {form.marketType === "option" && (
              <div className="mb-3">
                <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>行权价 (Strike)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.strikePrice}
                  onChange={(e) => setForm((f) => ({ ...f, strikePrice: e.target.value }))}
                  placeholder="输入行权价格"
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                  }}
                />
              </div>
            )}
            {/* 权利金单价已合并到开仓价字段 */}
            {/* 总权利金（自动计算，可手动覆盖） */}
            {form.marketType === "option" && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs" style={{ color: OKX_TEXT_SEC }}>总权利金 (USDT)</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (premiumModified) {
                        // 切回自动模式
                        setPremiumModified(false);
                      } else {
                        // 切换为手动模式
                        setForm(f => ({ ...f, premium: '' }));
                        setPremiumModified(true);
                      }
                    }}
                    className="text-xs px-2 py-0.5 rounded font-bold"
                    style={{
                      backgroundColor: premiumModified ? "rgba(240,185,11,0.15)" : "rgba(76,175,80,0.15)",
                      color: premiumModified ? OKX_YELLOW : "#4CAF50",
                      border: `1px solid ${premiumModified ? OKX_YELLOW : "#4CAF50"}`,
                    }}
                  >
                    {premiumModified ? "手动" : "自动"}
                  </button>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.premium}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, premium: e.target.value }));
                    if (!premiumModified) setPremiumModified(true);
                  }}
                  placeholder={
                    !premiumModified && form.entryPrice && form.quantity && form.contractSize
                      ? `自动 = ${form.entryPrice} × ${form.quantity} × ${form.contractSize}`
                      : "如 7475"
                  }
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                  style={{
                    background: premiumModified ? "rgba(255,255,255,0.05)" : "rgba(76,175,80,0.05)",
                    border: `1px solid ${premiumModified ? OKX_YELLOW : "#4CAF50"}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                  }}
                />
              </div>
            )}

            {/* 结算方式 + 面值（仅期权） */}
            {form.marketType === "option" && (
              <div className="mb-3">
                <label className="block text-xs mb-2" style={{ color: OKX_TEXT_SEC }}>结算方式</label>
                <div className="flex gap-2 mb-3">
                  {(["usdt", "coin"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, settlementType: t, contractSize: t === "usdt" ? "0.1" : "1" }))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={
                        form.settlementType === t
                          ? { backgroundColor: "rgba(240,185,11,0.15)", color: OKX_YELLOW, border: `1px solid rgba(240,185,11,0.4)` }
                          : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
                      }
                    >
                      {t === "usdt" ? "U本位" : "币本位"}
                    </button>
                  ))}
                </div>
                <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>合约面值（每张对应多少币）</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.contractSize}
                  onChange={(e) => setForm((f) => ({ ...f, contractSize: e.target.value }))}
                  placeholder="如 0.1（OKX ETH）或 1（Deribit）"
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                  }}
                />
              </div>
            )}
            {/* 隐含波动率 IV（仅期权） */}
            {form.marketType === "option" && (
              <div className="mb-3">
                <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>隐含波动率 IV (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.impliedVol}
                  onChange={(e) => setForm((f) => ({ ...f, impliedVol: e.target.value }))}
                  placeholder="如 80.5，开仓时的IV百分比"
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                  }}
                />
              </div>
            )}

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
        onClick={async () => {
          setEditingId(null);
          // 强制重新获取最新止盈价，确保与智能仓位管理同步
          await utils.orderFlow.getDefaultTakeProfit.invalidate();
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
