import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Play, RotateCcw, Settings, TrendingUp, Users, BarChart2, Info, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── 全局动画样式注入 ──────────────────────────────────────────
const LOADING_BAR_STYLE = `
  @keyframes loadingBar {
    0%   { width: 0%; opacity: 1; }
    80%  { width: 90%; opacity: 1; }
    95%  { width: 95%; opacity: 0.7; }
    100% { width: 95%; opacity: 0.7; }
  }
  .kline-loading-bar {
    animation: loadingBar 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('kline-loading-style')) {
  const s = document.createElement('style');
  s.id = 'kline-loading-style';
  s.textContent = LOADING_BAR_STYLE;
  document.head.appendChild(s);
}

// ─── 主题色 ──────────────────────────────────────────────────
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BORDER     = "#e4e7ed";
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT     = "#1a56db";
const ACCENT_BG  = "#eff6ff";
const ACCENT_LIGHT = "#dbeafe";
const BG_SUBTLE  = "#f0f2f5";
const GREEN      = "#16a34a";
const RED        = "#dc2626";

// ─── 类型定义 ───────────────────────────────────────────────
interface Participant {
  id: string;
  initialCash: number;
  commitPrice: number;
}

interface SimParams {
  initialPrice: number;
  gridInterval: number;
  numGridsUp: number;
  numGridsDown: number;
  executorShare: number;
  poolShare: number;
  redistributionShare: number;
  decayFactor: number;
}

interface TradeLog {
  barIdx: number;
  price: number;
  direction: "买入" | "卖出";
  actor: string;
  profit: number;
  distributions: { id: string; amount: number }[];
}

interface ParticipantResult {
  id: string;
  commitPrice: number;
  qty: number;
  initialCash: number;
  execIncome: number;
  redistIncome: number;
  totalDividend: number;
  holdingQty: number;
  holdingValue: number;
  totalAssets: number;
  netProfit: number;
  returnRate: number;
  buyCount: number;
  sellCount: number;
}

interface SimResult {
  participants: ParticipantResult[];
  publicPool: number;
  totalSellTrades: number;
  priceHigh: number;
  priceLow: number;
  finalPrice: number;
  normalizedRatio: number;
  logs: TradeLog[];
  netValueCurve: { idx: number; price: number; values: Record<string, number> }[];
}

// ─── 默认参数 ─────────────────────────────────────────────
const DEFAULT_PARAMS: SimParams = {
  initialPrice: 1500,
  gridInterval: 50,
  numGridsUp: 10,
  numGridsDown: 29,
  executorShare: 0.5,
  poolShare: 0.2,
  redistributionShare: 0.3,
  decayFactor: 0.7,
};

function buildParticipants(params: SimParams, perSlotFund: number): Participant[] {
  const { initialPrice, gridInterval, numGridsUp, numGridsDown } = params;
  const result: Participant[] = [];
  let id = 1;
  for (let i = numGridsUp; i >= 1; i--) {
    const price = initialPrice + gridInterval * i;
    result.push({ id: String(id++), initialCash: perSlotFund, commitPrice: price });
  }
  result.push({ id: String(id++), initialCash: perSlotFund, commitPrice: initialPrice });
  for (let i = 1; i <= numGridsDown; i++) {
    const price = initialPrice - gridInterval * i;
    if (price <= 0) break;
    result.push({ id: String(id++), initialCash: perSlotFund, commitPrice: price });
  }
  return result;
}

// ─── 回测引擎 ──────────────────────────────────────────────
function runBacktest(
  params: SimParams,
  participants: Participant[],
  klines: { open: number; high: number; low: number; close: number; time?: string }[],
  normalizedRatio: number = 1.0
): SimResult {
  const { gridInterval, executorShare, poolShare, redistributionShare, decayFactor } = params;

  const pState = new Map<string, {
    cash: number; holding: number; buyPrice: number | null;
    execIncome: number; redistIncome: number; buyCount: number; sellCount: number; qty: number;
  }>();

  for (const p of participants) {
    const qty = p.commitPrice > 0 ? p.initialCash / p.commitPrice : 0;
    pState.set(p.id, { cash: p.initialCash, holding: 0, buyPrice: null, execIncome: 0, redistIncome: 0, buyCount: 0, sellCount: 0, qty });
  }

  for (const p of participants) {
    if (p.commitPrice >= params.initialPrice) {
      const ps = pState.get(p.id)!;
      const cost = ps.qty * p.commitPrice;
      if (ps.cash >= cost) { ps.cash -= cost; ps.holding = ps.qty; ps.buyPrice = p.commitPrice; ps.buyCount++; }
    }
  }

  let publicPool = 0, totalSellTrades = 0;
  let priceHigh = params.initialPrice, priceLow = params.initialPrice;
  const logs: TradeLog[] = [];
  const netValueCurve: { idx: number; price: number; values: Record<string, number> }[] = [];

  for (let ki = 0; ki < klines.length; ki++) {
    const bar = klines[ki];
    const low = bar.low, high = bar.high, close = bar.close;
    priceHigh = Math.max(priceHigh, high);
    priceLow = Math.min(priceLow, low);

    for (const p of participants) {
      const ps = pState.get(p.id)!;
      const gridPrice = p.commitPrice;
      if (ps.holding === 0 && low <= gridPrice) {
        const cost = ps.qty * gridPrice;
        if (ps.cash >= cost) { ps.cash -= cost; ps.holding = ps.qty; ps.buyPrice = gridPrice; ps.buyCount++; logs.push({ barIdx: ki, price: gridPrice, direction: "买入", actor: p.id, profit: 0, distributions: [] }); }
      }
      if (ps.holding > 0 && ps.buyPrice !== null) {
        const sellPrice = ps.buyPrice + gridInterval;
        if (high >= sellPrice) {
          const grossProfit = ps.qty * gridInterval;
          const execShare = grossProfit * executorShare;
          const poolShare2 = grossProfit * poolShare;
          const redistTotal = grossProfit * redistributionShare;
          ps.cash += ps.qty * sellPrice; ps.execIncome += execShare; ps.sellCount++; totalSellTrades++; publicPool += poolShare2; ps.holding = 0; ps.buyPrice = null;
          const sellerIdx = participants.findIndex(q => q.id === p.id);
          const weights = participants.map((_, j) => Math.pow(decayFactor, Math.abs(j - sellerIdx)));
          const sumW = weights.reduce((s, w) => s + w, 0);
          const distributions: { id: string; amount: number }[] = [];
          participants.forEach((q, j) => { const share = redistTotal * (weights[j] / sumW); pState.get(q.id)!.redistIncome += share; distributions.push({ id: q.id, amount: share }); });
          logs.push({ barIdx: ki, price: sellPrice, direction: "卖出", actor: p.id, profit: execShare, distributions });
        }
      }
    }
    const step = Math.max(1, Math.floor(klines.length / 200));
    if (ki % step === 0) {
      const vals: Record<string, number> = {};
      for (const p of participants) { const ps = pState.get(p.id)!; vals[p.id] = ps.cash + ps.holding * close + ps.execIncome + ps.redistIncome; }
      netValueCurve.push({ idx: ki, price: close, values: vals });
    }
  }

  const finalPrice = klines[klines.length - 1]?.close ?? params.initialPrice;
  const resultParticipants: ParticipantResult[] = participants.map(p => {
    const ps = pState.get(p.id)!;
    const holdingValue = ps.holding * finalPrice;
    const floatPnl = ps.holding > 0 && ps.buyPrice !== null ? ps.holding * (finalPrice - ps.buyPrice) : 0;
    const totalAssets = p.initialCash + ps.execIncome + ps.redistIncome + floatPnl;
    const netProfit = totalAssets - p.initialCash;
    const returnRate = p.initialCash > 0 ? (netProfit / p.initialCash) * 100 : 0;
    return { id: p.id, commitPrice: p.commitPrice, qty: ps.qty, initialCash: p.initialCash, execIncome: ps.execIncome, redistIncome: ps.redistIncome, totalDividend: ps.execIncome + ps.redistIncome, holdingQty: ps.holding, holdingValue, totalAssets, netProfit, returnRate, buyCount: ps.buyCount, sellCount: ps.sellCount };
  });

  return { participants: resultParticipants, publicPool, totalSellTrades, priceHigh, priceLow, finalPrice, normalizedRatio, logs, netValueCurve };
}

function generateMockKlines(initialPrice: number, bars: number, volatility: number = 0.015) {
  const klines = []; let price = initialPrice; const now = Date.now();
  for (let i = 0; i < bars; i++) {
    const open = price; const change = (Math.random() - 0.5) * 2 * volatility * price; const close = Math.max(price * 0.3, price + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5); const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const t = new Date(now - (bars - i) * 3600000);
    klines.push({ open: Math.round(open * 100) / 100, high: Math.round(high * 100) / 100, low: Math.round(low * 100) / 100, close: Math.round(close * 100) / 100, time: `${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:00` });
    price = close;
  }
  return klines;
}

const COLORS = ["#1a56db", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

// ─── 历史模拟日志类型 ────────────────────────────────────────
const LEDGER_ID = 52;
interface SimLogEntry {
  id: string;
  createdAt: string;       // ISO 时间字符串
  months: string[];        // 回测月份
  params: SimParams;
  perSlotFund: number;
  summary: {
    totalNet: number;
    roi: number;
    totalSellTrades: number;
    publicPool: number;
    priceHigh: number;
    priceLow: number;
    startPrice: number;       // 首根开盘价（归一化后）
    finalPrice: number;
    priceChange: number;      // 币价涨跌幅 %
    participantCount: number;
    holdingCount: number;     // 期未有持仓的人数
    noHoldingCount: number;   // 期未无持仓的人数
    totalHoldingQty: number;  // 所有人总持仓币数
    avgHoldingCost: number;   // 持仓均价（加权均均买入价）
    // ── 风险指标 ──
    maxDrawdown: number;      // 最大回撤 %（基于净值曲线）
    maxDrawdownPrice: number; // 最大回撤时的价格
    sharpeRatio: number;      // 夏普比率（无风险利率3%年化）
    sortinoRatio: number;     // 索提诺比率
    calmarRatio: number;      // 卡玛比率 = 收益率 / 最大回撤
    winRate: number;          // 胜率 = 止盈次数 / 总买入次数 %
    profitFactor: number;     // 盈亏比 = 总盈利 / 总亏损
    avgProfitPerTrade: number; // 平均每次止盈收益
    totalBuyTrades: number;   // 总买入次数
    capitalUtilization: number; // 资金利用率 %（实际动用资金 / 总资金池）
    floatPnl: number;         // 期末浮动盈亏（持仓市值 - 持仓成本）
    annualizedRoi: number;    // 年化收益率 %
    klineCount: number;       // 回测K线数量
  };
  participants: ParticipantResult[]; // 参与者明细
  expanded?: boolean;      // UI 展开状态（不持久化）
}
// localStorage 日志已迁移至服务端数据库，此处保留空函数以防残留引用
function _noop() {}

// ─── 右滑删除组件 ────────────────────────────────────────
function SwipeToDelete({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [offsetX, setOffsetX] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const startXRef = React.useRef<number | null>(null);
  const DELETE_W = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    if (dx > 0 && !revealed) { setOffsetX(Math.min(dx, DELETE_W)); }
    if (dx < 0 && revealed) { setOffsetX(Math.max(DELETE_W + dx, 0)); }
  };
  const handleTouchEnd = () => {
    startXRef.current = null;
    if (!revealed && offsetX > DELETE_W * 0.4) {
      setOffsetX(DELETE_W); setRevealed(true);
    } else if (revealed && offsetX < DELETE_W * 0.6) {
      setOffsetX(0); setRevealed(false);
    } else {
      setOffsetX(revealed ? DELETE_W : 0);
    }
  };
  const handleClose = () => { setOffsetX(0); setRevealed(false); };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
      {/* 删除按鈕（左侧背景） */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: DELETE_W,
          background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, cursor: 'pointer',
        }}
        onClick={onDelete}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Trash2 style={{ width: 18, height: 18, color: '#fff' }} />
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>删除</span>
        </div>
      </div>
      {/* 内容区域 */}
      <div
        style={{ transform: `translateX(${offsetX}px)`, transition: startXRef.current ? 'none' : 'transform 0.2s ease', position: 'relative', zIndex: 1 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={revealed ? handleClose : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// ─── 主页面组件 ─────────────────────────────────────────────
export default function GridTradeSimulator() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<SimResult | null>(null);
  const [activeTab, setActiveTab] = useState<"params" | "result" | "chart" | "log">("params");
  const [activeYearTab, setActiveYearTab] = useState<string>('2025');
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0); // 0=idle 1=读K线 2=计算网格 3=统计结果
  const [perSlotFund, setPerSlotFund] = useState(150000);
  const [perSlotFundInput, setPerSlotFundInput] = useState('150000');
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['2025_01']);
  // rangeAnchor: 区间选择的锤点（第一次点击的月份）
  const [rangeAnchor, setRangeAnchor] = useState<string | null>('2025_01');
  // 历史模拟日志（服务端存储）
  const { data: simLogsRaw, refetch: refetchSimLogs } = trpc.getGridSimLogs.useQuery(
    { ledgerId: LEDGER_ID },
    { staleTime: 5000 }
  );
  const simLogs: SimLogEntry[] = (simLogsRaw || []).map((r: any) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
  const saveGridSimLogMutation = trpc.saveGridSimLog.useMutation({
    onSuccess: () => refetchSimLogs(),
  });
  const deleteGridSimLogMutation = trpc.deleteGridSimLog.useMutation({
    onSuccess: () => refetchSimLogs(),
  });

  // 实时ETH价格（走服务器tRPC，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  const liveEthPrice: number | null = (cryptoPricesRaw as any)?.prices?.['ETH'] ?? null;
  // 实时时钟（每秒更新）
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // 当实时价格到来时，自动同步到价格基准点（取最近的 gridInterval 整倍数）
  const liveEthPriceRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (liveEthPrice == null) return;
    liveEthPriceRef.current = liveEthPrice;
    setParams(p => {
      const interval = p.gridInterval;
      const snapped = Math.round(liveEthPrice / interval) * interval;
      return { ...p, initialPrice: snapped };
    });
  }, [liveEthPrice]);

  // 可选年份（有K线数据的年份，降序）
  const AVAILABLE_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'];
  const [selectedYear, setSelectedYear] = useState<string>('2025');

  // 根据当前选中年份动态生成月份选项
  const getMonthOptionsForYear = (year: string) => {
    const months = year === '2026'
      ? ['01','02','03','04','05','06']  // 2026年只到1-6月
      : ['01','02','03','04','05','06','07','08','09','10','11','12'];
    return months.map(m => ({ value: `${year}_${m}`, label: `${parseInt(m)}月` }));
  };
  const MONTH_OPTIONS = getMonthOptionsForYear(selectedYear);

  // 年份切换时重置选中月份
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    const opts = getMonthOptionsForYear(year);
    setSelectedMonths([opts[0].value]);
    setRangeAnchor(opts[0].value);
  };

  // 区间选择逻辑：第一次点击设为锤点，第二次点击自动填满中间所有月份
  const handleMonthClick = (val: string) => {
    const allVals = MONTH_OPTIONS.map(o => o.value);
    const clickedIdx = allVals.indexOf(val);
    if (rangeAnchor === null) {
      // 无锤点，设置锤点并选中单月
      setRangeAnchor(val);
      setSelectedMonths([val]);
    } else {
      const anchorIdx = allVals.indexOf(rangeAnchor);
      if (anchorIdx === clickedIdx) {
        // 再次点击锤点自身：重置锤点（保持单月选中）
        setRangeAnchor(null);
        setSelectedMonths([val]);
      } else {
        // 点击另一个月：选中锤点到该月之间的所有月份
        const lo = Math.min(anchorIdx, clickedIdx);
        const hi = Math.max(anchorIdx, clickedIdx);
        const range = allVals.slice(lo, hi + 1);
        setSelectedMonths(range);
        setRangeAnchor(null); // 选完后清除锤点，下次点击重新开始
      }
    }
  };

  useEffect(() => { setPerSlotFundInput(String(perSlotFund)); }, [perSlotFund]);

  const [realKlineData, setRealKlineData] = useState<{klines: any[], yearMonths: string[]} | null>(null);
  const [klineLoading, setKlineLoading] = useState(false);

  useEffect(() => {
    if (!selectedMonths.length) return;
    setKlineLoading(true);
    setRealKlineData(null);
    const params = selectedMonths.map(m => `yearMonths=${encodeURIComponent(m)}`).join('&');
    fetch(`/api/grid-klines?${params}`)
      .then(r => r.json())
      .then(d => { setRealKlineData(d); setKlineLoading(false); })
      .catch(e => { console.error('[GridKlines]', e); setKlineLoading(false); });
  }, [selectedMonths.join(',')]);

  useEffect(() => {
    if (!realKlineData?.klines?.length) return;
    // 用首根开盘价作为价格基准点（取整到个位）
    const firstOpen = realKlineData.klines[0].o;
    const anchor = Math.round(firstOpen);
    const ratio = anchor / firstOpen;
    // 将所有价格按比例归一化到 anchor
    const normHighs = realKlineData.klines.map((k: any) => k.h * ratio);
    const normLows  = realKlineData.klines.map((k: any) => k.l * ratio);
    const hi = normHighs.reduce((m: number, v: number) => v > m ? v : m, -Infinity);
    const lo = normLows.reduce((m: number, v: number)  => v < m ? v : m, Infinity);
    const range = hi - lo;
    const rawInterval = range / 30;
    const snapOptions = [10,20,25,30,35,40,45,50,60,70,80,100,120,150,200];
    const snappedInterval = snapOptions.reduce((prev, curr) => Math.abs(curr - rawInterval) < Math.abs(prev - rawInterval) ? curr : prev);
    const suggestUp   = Math.max(1, Math.min(20, Math.round((hi - anchor) / snappedInterval)));
    const suggestDown = Math.max(1, Math.min(29, Math.round((anchor - lo) / snappedInterval)));
    // initialPrice 优先用实时价对齐到新间隔的整倍数，实时价不可用时回退到首根开盘价
    const liveSnapped = liveEthPriceRef.current != null
      ? Math.round(liveEthPriceRef.current / snappedInterval) * snappedInterval
      : anchor;
    setParams(p => ({ ...p, initialPrice: liveSnapped, gridInterval: snappedInterval, numGridsUp: suggestUp, numGridsDown: suggestDown }));
  }, [realKlineData]);

  const participants = buildParticipants(params, perSlotFund);

  const handleRun = useCallback(() => {
    setRunning(true);
    setRunStep(1);
    setTimeout(() => { setRunStep(2); }, 500);
    setTimeout(() => { setRunStep(3); }, 1000);
    setTimeout(() => {
      const ps = buildParticipants(params, perSlotFund);
      let klines: { open: number; high: number; low: number; close: number; time?: string }[];
      let normalizedRatio = 1.0;
      if (realKlineData?.klines?.length > 0) {
        const rawKlines = realKlineData.klines.map((k: any) => ({ open: k.o, high: k.h, low: k.l, close: k.c }));
        const firstOpen = rawKlines[0].open;
        normalizedRatio = params.initialPrice / firstOpen;
        klines = rawKlines.map((k: any) => ({ open: k.open * normalizedRatio, high: k.high * normalizedRatio, low: k.low * normalizedRatio, close: k.close * normalizedRatio }));
      } else {
        klines = generateMockKlines(params.initialPrice, 500, 0.015);
      }
      const res = runBacktest(params, ps, klines, normalizedRatio);
      setResult(res); setActiveTab("result"); setRunning(false); setRunStep(0);
      // 写入历史日志
      const totalInit = res.participants.reduce((s: number, p: any) => s + p.initialCash, 0);
      const totalAssets = res.participants.reduce((s: number, p: any) => s + p.totalAssets, 0);
      const totalNet = totalAssets - totalInit;
      const roi = totalInit > 0 ? (totalNet / totalInit) * 100 : 0;
      // 持仓统计
      const holdingPs = res.participants.filter((p: any) => p.holdingQty > 0);
      const noHoldingPs = res.participants.filter((p: any) => p.holdingQty <= 0);
      const totalHoldingQty = holdingPs.reduce((s: number, p: any) => s + p.holdingQty, 0);
      const avgHoldingCost = totalHoldingQty > 0
        ? holdingPs.reduce((s: number, p: any) => s + p.commitPrice * p.holdingQty, 0) / totalHoldingQty
        : 0;
      const startPrice = params.initialPrice;
      const priceChange = startPrice > 0 ? ((res.finalPrice - startPrice) / startPrice) * 100 : 0;
      // 浮动盈亏
      const floatPnl = holdingPs.reduce((s: number, p: any) => s + p.holdingQty * (res.finalPrice - p.commitPrice), 0);
      // 最大回撤（基于第一个参与者的净值曲线计算组合回撤）
      let maxDrawdown = 0, maxDrawdownPrice = res.priceHigh;
      if (res.netValueCurve.length > 1) {
        let peak = totalInit;
        for (const pt of res.netValueCurve) {
          const curTotal = res.participants.reduce((s: number, p: any) => s + (pt.values[p.id] ?? 0), 0);
          if (curTotal > peak) peak = curTotal;
          const dd = peak > 0 ? (peak - curTotal) / peak * 100 : 0;
          if (dd > maxDrawdown) { maxDrawdown = dd; maxDrawdownPrice = pt.price; }
        }
      }
      // 夏普比率 / 索提诺比率（基于净值曲线每步收益率）
      let sharpeRatio = 0, sortinoRatio = 0;
      if (res.netValueCurve.length > 2) {
        const rets: number[] = [];
        let prevTotal = totalInit;
        for (const pt of res.netValueCurve) {
          const cur = res.participants.reduce((s: number, p: any) => s + (pt.values[p.id] ?? 0), 0);
          if (prevTotal > 0) rets.push((cur - prevTotal) / prevTotal);
          prevTotal = cur;
        }
        const n = rets.length;
        const mean = rets.reduce((s, r) => s + r, 0) / n;
        const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n;
        const std = Math.sqrt(variance);
        const rf = 0.03 / (365 * 24 * 60); // 无风险利率3%年化，按分钟折算
        sharpeRatio = std > 0 ? (mean - rf) / std * Math.sqrt(n) : 0;
        const downRets = rets.filter(r => r < 0);
        const downVar = downRets.length > 0 ? downRets.reduce((s, r) => s + r * r, 0) / downRets.length : 0;
        const downStd = Math.sqrt(downVar);
        sortinoRatio = downStd > 0 ? (mean - rf) / downStd * Math.sqrt(n) : 0;
      }
      // 卡玛比率
      const calmarRatio = maxDrawdown > 0 ? Math.abs(roi) / maxDrawdown * (roi >= 0 ? 1 : -1) : 0;
      // 胜率、盈亏比
      const totalBuyTrades = res.participants.reduce((s: number, p: any) => s + p.buyCount, 0);
      const winRate = totalBuyTrades > 0 ? (res.totalSellTrades / totalBuyTrades) * 100 : 0;
      const totalGrossProfit = res.totalSellTrades * params.gridInterval * (res.participants[0]?.qty ?? 0);
      const totalGrossLoss = Math.max(0, -totalNet + totalGrossProfit);
      const profitFactor = totalGrossLoss > 0 ? totalGrossProfit / totalGrossLoss : totalGrossProfit > 0 ? 999 : 0;
      const avgProfitPerTrade = res.totalSellTrades > 0 ? totalGrossProfit / res.totalSellTrades : 0;
      // 资金利用率：实际发生买入的总次数 × 单次资金 / 总资金池
      const capitalUtilization = totalInit > 0 ? (totalBuyTrades * perSlotFund) / totalInit * 100 : 0;
      // 年化收益率（回测K线数 / 525600分钟年）
      const klineCount = klines.length;
      const annualizedRoi = klineCount > 0 ? roi * (525600 / klineCount) : 0;
      const newEntry: SimLogEntry = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        months: [...selectedMonths].sort(),
        params: { ...params },
        perSlotFund,
        summary: {
          totalNet,
          roi,
          totalSellTrades: res.totalSellTrades,
          publicPool: res.publicPool,
          priceHigh: res.priceHigh,
          priceLow: res.priceLow,
          startPrice,
          finalPrice: res.finalPrice,
          priceChange,
          participantCount: res.participants.length,
          holdingCount: holdingPs.length,
          noHoldingCount: noHoldingPs.length,
          totalHoldingQty,
          avgHoldingCost,
          maxDrawdown,
          maxDrawdownPrice,
          sharpeRatio,
          sortinoRatio,
          calmarRatio,
          winRate,
          profitFactor,
          avgProfitPerTrade,
          totalBuyTrades,
          capitalUtilization,
          floatPnl,
          annualizedRoi,
          klineCount,
        },
        participants: res.participants,
      };
      // 保存到服务端数据库
      saveGridSimLogMutation.mutate({
        ledgerId: LEDGER_ID,
        months: newEntry.months,
        params: newEntry.params,
        summary: newEntry.summary,
        perSlotFund: newEntry.perSlotFund,
        participants: newEntry.participants,
      });
    }, 1500);
  }, [params, perSlotFund, realKlineData]);

  const handleReset = () => { setResult(null); setParams(DEFAULT_PARAMS); setActiveTab("params"); };
  const updateParam = (key: keyof SimParams, val: number) => setParams(p => {
    const next = { ...p, [key]: val };
    // 每档间隔变化时，重新对齐 initialPrice 到最近的整倍数
    if (key === 'gridInterval') {
      const interval = val;
      next.initialPrice = Math.round(p.initialPrice / interval) * interval;
    }
    return next;
  });
  const fmt = (n: number) => n >= 0 ? `+${n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}` : n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  const fmtU = (n: number) => `${Math.round(n).toLocaleString("zh-CN")} u`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG_PAGE, color: TEXT_MAIN, maxWidth: 480, margin: '0 auto' }}>

      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: BG_WHITE, borderBottom: `1px solid ${BORDER}` }}>
        <button
          onClick={() => setLocation("/ledger/52")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: BG_SUBTLE }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold" style={{ color: TEXT_MAIN }}>网格交易模拟测算</h1>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>分布式做市 · 双向利润共享</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{ background: BG_SUBTLE }}
        >
          <RotateCcw className="w-4 h-4" style={{ color: TEXT_SUB }} />
        </button>
      </div>

      {/* ── Tab 切换 ── */}
      <div className="px-4 pt-3">
        <div className="flex rounded-md overflow-hidden" style={{ background: BG_SUBTLE, padding: 3, gap: 2 }}>
          {([
            { key: "params", label: "参数", icon: Settings },
            { key: "result", label: "结果", icon: Users },
            { key: "chart",  label: "走势", icon: TrendingUp },
            { key: "log",    label: "日志", icon: BarChart2 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{
                background: activeTab === key ? BG_WHITE : 'transparent',
                color: activeTab === key ? ACCENT : TEXT_MUTED,
                boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 overflow-y-auto pb-28 mt-3">

        {/* ── 参数面板 ── */}
        {activeTab === "params" && (
          <div className="px-4 space-y-4">

            {/* 回测时段选择器 */}
            <div className="rounded-md p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              {/* 年份切换Tab */}
              <div className="flex gap-1.5 overflow-x-auto mb-3" style={{ scrollbarWidth: 'none' }}>
                {AVAILABLE_YEARS.map(yr => (
                  <button
                    key={yr}
                    onClick={() => handleYearChange(yr)}
                    className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all"
                    style={{
                      background: selectedYear === yr ? ACCENT : BG_SUBTLE,
                      color: selectedYear === yr ? '#fff' : TEXT_MUTED,
                      border: `1px solid ${selectedYear === yr ? ACCENT : BORDER}`,
                    }}
                  >
                    {yr}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>回测时段 · {selectedYear}</span>
                <div className="flex items-center gap-2">
                  {klineLoading && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT_LIGHT, borderTopColor: ACCENT }} />
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>加载中</span>
                    </div>
                  )}
                  {!klineLoading && realKlineData?.klines && (
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>{realKlineData.klines.length.toLocaleString()} 根</span>
                  )}
                  {selectedMonths.length > 1 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: ACCENT_BG, color: ACCENT }}>{selectedMonths.length}个月</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {MONTH_OPTIONS.map((opt) => {
                  const isSelected = selectedMonths.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleMonthClick(opt.value)}
                      className="py-2 rounded-md text-xs font-bold transition-all"
                      style={{
                        background: isSelected ? ACCENT : BG_SUBTLE,
                        color: isSelected ? '#fff' : TEXT_SUB,
                        border: isSelected ? `2px solid ${ACCENT}` : `2px solid transparent`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* 数据摘要卡片：时段实时显示，数据量等待加载 */}
              {(() => {
                // 根据selectedMonths直接计算时段（不依赖已加载数据）
                const sorted = [...selectedMonths].sort();
                const firstMonth = sorted[0];
                const lastMonth = sorted[sorted.length - 1];
                const [, fm] = firstMonth.split('_').map(Number);
                const [ly, lm] = lastMonth.split('_').map(Number);
                const lastDay = new Date(ly, lm, 0).getDate();
                // 计算天数
                const startDate = new Date(2025, fm - 1, 1);
                const endDate = new Date(ly, lm - 1, lastDay);
                const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

                // 已加载数据的统计
                const klines = realKlineData?.klines;
                const hasData = !klineLoading && klines && klines.length > 0;
                // 用第1条开盘价作为归一化基准（买入价）
                const firstOpen = hasData ? klines[0].o : null;
                const allHigh = hasData ? klines.reduce((m: number, k: any) => k.h > m ? k.h : m, -Infinity) : null;
                const allLow = hasData ? klines.reduce((m: number, k: any) => k.l < m ? k.l : m, Infinity) : null;
                // 振幅
                const amplitude = (allHigh != null && allLow != null && allLow > 0)
                  ? (((allHigh - allLow) / allLow) * 100).toFixed(1) : null;

                const LoadBar = ({ delay = '0s' }: { delay?: string }) => (
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: ACCENT_LIGHT }}>
                    <div key={klineLoading ? 'loading' : 'done'} className="h-full rounded-full kline-loading-bar" style={{ background: ACCENT, animationDelay: delay }} />
                  </div>
                );

                return (
                  <div className="mt-3 rounded-md overflow-hidden" style={{ border: `1px solid ${ACCENT_LIGHT}`, background: ACCENT_BG }}>
                    {/* 第一行：时段 + 1分钟K线数 */}
                    <div className="flex items-stretch" style={{ borderBottom: `1px solid ${ACCENT_LIGHT}` }}>
                      <div className="flex-1 px-3 py-2.5" style={{ borderRight: `1px solid ${ACCENT_LIGHT}` }}>
                        <div className="text-xs mb-1" style={{ color: ACCENT }}>回测时段</div>
                        <div className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                          {fm}月1日 – {lm}月{lastDay}日
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>共 {totalDays} 天 · 北京时间 CST</div>
                      </div>
                      <div className="px-3 py-2.5" style={{ minWidth: 110 }}>
                        <div className="text-xs mb-1" style={{ color: ACCENT }}>1分钟K线数</div>
                        {klineLoading ? <LoadBar /> : (
                          <div className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                            {hasData ? klines.length.toLocaleString() : '—'}
                          </div>
                        )}
                        <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>每根 = 1 分钟</div>
                      </div>
                    </div>
                    {/* 第二行：最低价 + 最高价 + 振幅 */}
                    <div className="flex items-stretch" style={{ borderBottom: `1px solid ${ACCENT_LIGHT}` }}>
                      <div className="flex-1 px-3 py-2.5" style={{ borderRight: `1px solid ${ACCENT_LIGHT}` }}>
                        <div className="text-xs mb-1" style={{ color: ACCENT }}>区间最低价</div>
                        {klineLoading ? <LoadBar delay="0.1s" /> : (
                          <div className="text-sm font-bold" style={{ color: GREEN }}>
                            {allLow != null ? allLow.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} <span className="text-xs font-normal">u</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 px-3 py-2.5" style={{ borderRight: `1px solid ${ACCENT_LIGHT}` }}>
                        <div className="text-xs mb-1" style={{ color: ACCENT }}>区间最高价</div>
                        {klineLoading ? <LoadBar delay="0.2s" /> : (
                          <div className="text-sm font-bold" style={{ color: RED }}>
                            {allHigh != null ? allHigh.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} <span className="text-xs font-normal">u</span>
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2.5" style={{ minWidth: 80 }}>
                        <div className="text-xs mb-1" style={{ color: ACCENT }}>振幅</div>
                        {klineLoading ? <LoadBar delay="0.15s" /> : (
                          <div className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                            {amplitude != null ? `${amplitude}%` : '—'}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 第三行：以太坊实时价 */}
                    <div className="px-3 py-2" style={{ borderBottom: `1px solid ${ACCENT_LIGHT}`, background: ACCENT_BG }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: ACCENT }}>以太坊实时价</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: ACCENT }}>
                            {liveEthPrice != null ? `${liveEthPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u` : '读取中…'}
                          </span>
                          <span className="text-xs" style={{ color: TEXT_MUTED }}>
                            {new Date(nowTs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* 第四行：首根开盘价 + 归一化比例 */}
                    <div className="px-3 py-2.5">
                      <div className="text-xs mb-1 flex items-center gap-1" style={{ color: ACCENT }}>
                        首根开盘价
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>(归一化买入基准)</span>
                      </div>
                      {klineLoading ? <LoadBar delay="0.05s" /> : (
                        <div className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                          {firstOpen != null ? (
                            <>
                              <span style={{ color: TEXT_SUB }}>{firstOpen.toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>
                              <span className="mx-1.5 text-xs" style={{ color: TEXT_MUTED }}>→ 归一化至</span>
                              <span style={{ color: ACCENT }}>{params.initialPrice.toLocaleString()} u</span>
                              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ background: ACCENT_LIGHT, color: ACCENT }}>
                                ×{(params.initialPrice / firstOpen).toFixed(4)}
                              </span>
                            </>
                          ) : '—'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 网格参数 */}
            {(() => {
              // 真实ETH价格 = 规划价 / 归一化比例（首根开盘价 / 价格基准点）
              const rawFirstOpen = realKlineData?.klines?.[0]?.o ?? null;
              // normRatio = params.initialPrice / rawFirstOpen，即规划价/真实价
              const normRatio = rawFirstOpen != null && rawFirstOpen > 0 ? params.initialPrice / rawFirstOpen : null;
              const toReal = (planPrice: number) => normRatio != null ? Math.round(planPrice / normRatio) : null;
              const anchorReal = toReal(params.initialPrice);
              const highPlan = params.initialPrice + params.numGridsUp * params.gridInterval;
              const lowPlan  = Math.max(params.gridInterval, params.initialPrice - params.numGridsDown * params.gridInterval);
              return (
                <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: BORDER }}>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>网格参数</span>
                  </div>
                  <WhiteParamRowWithTip
                    label="价格基准点"
                    unit="u"
                    value={params.initialPrice}
                    min={100}
                    max={100000}
                    step={50}
                    onChange={v => updateParam("initialPrice", v)}
                    tip="价格基准点（Anchor Price）是网格交易的中心定锡价格。向上每涨一档就卖出，向下每跌一档就买入。基准点设得越高，高档位参与者初始持仓成本越高，但下跌时买入机会越多；基准点设得越低，初始持仓成本低，但高档位参与者需要等待更长时间才能止盈。归一化模式下，真实价格会按比例缩放到此基准点。"
                  />

                  <WhiteNonLinearRow label="每档间隔" unit="u" value={params.gridInterval}
                    options={[10,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]}
                    onChange={v => updateParam("gridInterval", v)} />
                  <WhiteParamRow label="向上档数" unit="档" value={params.numGridsUp} min={1} max={50} step={1} onChange={v => updateParam("numGridsUp", v)} />
                  <div className="px-4 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>最高网格价</span>
                      <span className="text-xs font-bold" style={{ color: RED }}>
                        {highPlan.toLocaleString()} u
                        <span className="ml-1 font-normal" style={{ color: TEXT_MUTED }}>(+{params.numGridsUp}档)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>向上承诺岗位</span>
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>可容纳 <span className="font-bold" style={{ color: ACCENT }}>{params.numGridsUp} 人</span>（每档 1 人）</span>
                    </div>
                  </div>
                  <WhiteParamRow label="向下档数" unit="档" value={params.numGridsDown} min={1} max={Math.max(1, Math.floor((params.initialPrice - params.gridInterval) / params.gridInterval))} step={1} onChange={v => updateParam("numGridsDown", v)} />
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>最低网格价</span>
                      <span className="text-xs font-bold" style={{ color: GREEN }}>
                        {lowPlan.toLocaleString()} u
                        <span className="ml-1 font-normal" style={{ color: TEXT_MUTED }}>(-{params.numGridsDown}档)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>向下承诺岗位</span>
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>可容纳 <span className="font-bold" style={{ color: ACCENT }}>{params.numGridsDown} 人</span>（每档 1 人）</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: `1px dashed ${BORDER}` }}>
                      <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>共可容纳参与者</span>
                      <span className="text-xs font-bold" style={{ color: ACCENT }}>{params.numGridsUp + params.numGridsDown} 人（{params.numGridsUp} 上 + {params.numGridsDown} 下）</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 参与者配置 */}
            <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: BORDER }}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>参与者配置</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: ACCENT_BG, color: ACCENT }}>{participants.length} 人</span>
              </div>
              <div className="px-4 py-3 border-b" style={{ borderColor: BORDER }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs flex-shrink-0 w-24" style={{ color: TEXT_SUB }}>每档投入资金</span>
                  <input
                    type="range" min={1000} max={500000} step={1000} value={perSlotFund}
                    onInput={e => setPerSlotFund(Number((e.target as HTMLInputElement).value))}
                    className="flex-1" style={{ accentColor: ACCENT }}
                  />
                  <div className="flex items-center gap-1 w-24 justify-end">
                    <input
                      type="text" inputMode="numeric" value={perSlotFundInput}
                      onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setPerSlotFundInput(raw); const n = parseInt(raw, 10); if (!isNaN(n) && n >= 1000) setPerSlotFund(n); }}
                      onBlur={() => { const n = parseInt(perSlotFundInput, 10); const clamped = isNaN(n) ? 1000 : Math.max(1000, n); setPerSlotFund(clamped); setPerSlotFundInput(String(clamped)); }}
                      className="w-20 rounded-lg px-2 py-1 text-xs text-right outline-none"
                      style={{ background: BG_SUBTLE, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}
                    />
                    <span className="text-xs w-4" style={{ color: TEXT_MUTED }}>u</span>
                  </div>
                </div>
                <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>所有参与者每档投入相同资金，价格越低可买币数越多</p>
              </div>
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: BORDER }}>
                {participants.map((p, i) => {
                  const coins = p.commitPrice > 0 ? Math.floor(perSlotFund / p.commitPrice) : 0;
                  const isAnchor = p.commitPrice === params.initialPrice;
                  return (
                    <div key={p.id} className="px-4 py-1.5 flex items-center justify-between" style={isAnchor ? { background: '#fff7ed' } : {}}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isAnchor ? '#f97316' : COLORS[i % COLORS.length] }} />
                        <span className="text-xs font-bold" style={{ color: isAnchor ? '#ea580c' : TEXT_MAIN }}>{p.id}号</span>
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>承诺价</span>
                        <span className="text-xs font-medium" style={{ color: isAnchor ? '#ea580c' : TEXT_MAIN }}>{p.commitPrice.toLocaleString()} u</span>
                        {isAnchor && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#fed7aa', color: '#c2410c' }}>现价买入</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>可买</span>
                        <span className="text-xs font-bold" style={{ color: isAnchor ? '#f97316' : COLORS[i % COLORS.length] }}>{coins.toLocaleString()} 枚</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 利润分配 */}
            <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="px-4 py-2.5 border-b" style={{ borderColor: BORDER }}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>利润分配</span>
              </div>
              <WhiteParamRow label="执行者保留" unit="%" value={Math.round(params.executorShare * 100)} min={10} max={90} step={5} onChange={v => updateParam("executorShare", v / 100)} />
              <WhiteParamRow label="公共资金池" unit="%" value={Math.round(params.poolShare * 100)} min={0} max={50} step={5} onChange={v => updateParam("poolShare", v / 100)} />
              <WhiteParamRow label="再分配比例" unit="%" value={Math.round(params.redistributionShare * 100)} min={0} max={50} step={5} onChange={v => updateParam("redistributionShare", v / 100)} />
              <WhiteParamRow label="衰减系数 r" unit="" value={params.decayFactor} min={0.1} max={0.99} step={0.05} onChange={v => updateParam("decayFactor", v)} />
            </div>
          </div>
        )}

        {/* ── 结果面板 ── */}
        {activeTab === "result" && result && (
          <div className="px-4 space-y-3">
            {/* 本次模拟配置摘要 */}
            {(() => {
              const monthLabels = selectedMonths
                .sort()
                .map(v => MONTH_OPTIONS.find(o => o.value === v)?.label ?? v)
                .join('、');
              const totalSlots = params.numGridsUp + params.numGridsDown + 1;
              return (
                <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: BORDER }}>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>本次模拟配置</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0 divide-y" style={{ borderColor: BORDER }}>
                    {[
                      { label: '回测时段', value: `2025年 ${monthLabels}` },
                      { label: '价格基准点', value: `${params.initialPrice.toLocaleString()} u` },
                      { label: '每档间隔', value: `${params.gridInterval} u` },
                      { label: '向上档数', value: `${params.numGridsUp} 档（最高 ${(params.initialPrice + params.numGridsUp * params.gridInterval).toLocaleString()} u）` },
                      { label: '向下档数', value: `${params.numGridsDown} 档（最低 ${Math.max(params.gridInterval, params.initialPrice - params.numGridsDown * params.gridInterval).toLocaleString()} u）` },
                      { label: '参与者岗位', value: `${totalSlots} 人` },
                      { label: '每档投入', value: `${perSlotFund.toLocaleString()} u` },
                      { label: '总资金池', value: `${(perSlotFund * totalSlots).toLocaleString()} u` },
                      { label: '执行者保留', value: `${Math.round(params.executorShare * 100)}%` },
                      { label: '公共资金池', value: `${Math.round(params.poolShare * 100)}%` },
                      { label: '再分配比例', value: `${Math.round(params.redistributionShare * 100)}%` },
                      { label: '衰减系数 r', value: `${params.decayFactor}` },
                    ].map((item, idx) => (
                      <div key={item.label} className="px-4 py-2 flex items-center justify-between" style={idx % 2 === 1 ? { background: BG_SUBTLE } : {}}>
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>{item.label}</span>
                        <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 归一化提示 */}
            {result.normalizedRatio !== 1.0 && (
              <div className="flex items-start gap-2 rounded-md px-3 py-2.5" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_LIGHT}` }}>
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ACCENT }} />
                <div className="text-xs" style={{ color: ACCENT }}>
                  <span className="font-bold">已启用归一化</span>：真实ETH价格（约{Math.round(params.initialPrice / result.normalizedRatio).toLocaleString()} u）已等比缩放至基准价 {params.initialPrice} u，回测结果比例完全一致。
                </div>
              </div>
            )}

            {/* 整体收益率大卡 */}
            {(() => {
              const totalInit = result.participants.reduce((s, p) => s + p.initialCash, 0);
              const totalAssets = result.participants.reduce((s, p) => s + p.totalAssets, 0);
              const totalNet = totalAssets - totalInit;
              const roi = totalInit > 0 ? (totalNet / totalInit) * 100 : 0;
              return (
                <div className="rounded-md p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>整体净利润</div>
                      <div className="text-lg font-bold" style={{ color: totalNet >= 0 ? RED : GREEN }}>{fmt(totalNet)} u</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>整体收益率</div>
                      <div className="text-3xl font-bold" style={{ color: roi >= 0 ? RED : GREEN }}>{roi >= 0 ? "+" : ""}{roi.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 全局指标 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "止盈次数", value: `${result.totalSellTrades} 次` },
                { label: "公共资金池", value: fmtU(result.publicPool) },
                { label: "回测最高价", value: `${result.priceHigh.toFixed(0)} u` },
                { label: "回测最低价", value: `${result.priceLow.toFixed(0)} u` },
                { label: "期末价格", value: `${result.finalPrice.toFixed(0)} u` },
                { label: "总参与者", value: `${result.participants.length} 人` },
              ].map(item => (
                <div key={item.label} className="rounded-md p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>{item.label}</div>
                  <div className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 各参与者明细 */}
            <div className="space-y-2">
              {result.participants.map((p, i) => (
                <div key={p.id} className="rounded-md p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="font-bold text-sm" style={{ color: TEXT_MAIN }}>{p.id}号</span>
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>承诺价 {p.commitPrice.toLocaleString()} u</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: p.netProfit >= 0 ? RED : GREEN }}>
                      {fmt(p.netProfit)} u（{p.returnRate >= 0 ? "+" : ""}{p.returnRate.toFixed(2)}%）
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      { label: "初始出资", value: fmtU(p.initialCash), color: TEXT_MAIN },
                      { label: "买入枚数", value: `${p.qty.toFixed(1)} 枚/次`, color: TEXT_MAIN },
                      { label: "买入次数", value: `${p.buyCount} 次`, color: TEXT_MAIN },
                      { label: "止盈次数", value: `${p.sellCount} 次`, color: TEXT_MAIN },
                      { label: "执行者利润", value: fmtU(p.execIncome), color: RED },
                      { label: "衰减再分配", value: fmtU(p.redistIncome), color: ACCENT },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between">
                        <span style={{ color: TEXT_MUTED }}>{item.label}</span>
                        <span style={{ color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                    {p.holdingQty > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span style={{ color: TEXT_MUTED }}>期末持仓</span>
                          <span style={{ color: TEXT_MAIN }}>{p.holdingQty.toFixed(1)} 枚</span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: TEXT_MUTED }}>持仓市值</span>
                          <span style={{ color: TEXT_MAIN }}>{fmtU(p.holdingValue)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between col-span-2 pt-1.5 border-t mt-0.5" style={{ borderColor: BORDER }}>
                      <span style={{ color: TEXT_MUTED }}>期末总资产</span>
                      <span className="font-bold" style={{ color: p.netProfit >= 0 ? RED : GREEN }}>{fmtU(p.totalAssets)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 走势图 ── */}
        {activeTab === "chart" && result && (
          <div className="px-4 space-y-3">
            <div className="rounded-md p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>各参与者总资产变化（U）</p>
              <div className="relative" style={{ height: 220 }}>
                <NetValueChart data={result.netValueCurve} participants={participants} colors={COLORS} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {participants.slice(0, 12).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-1">
                    <div className="w-3 h-1.5 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>{p.id}号</span>
                  </div>
                ))}
                {participants.length > 12 && <span className="text-xs" style={{ color: TEXT_MUTED }}>...共{participants.length}人</span>}
              </div>
            </div>

            <div className="rounded-md p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <p className="text-xs mb-2" style={{ color: TEXT_MUTED }}>价格走势{result.normalizedRatio !== 1.0 ? "（归一化后）" : ""}</p>
              <div className="flex items-end gap-0.5" style={{ height: 80 }}>
                {result.netValueCurve.map((d, i) => {
                  const ratio = (result.priceHigh - result.priceLow) > 0 ? (d.price - result.priceLow) / (result.priceHigh - result.priceLow) : 0.5;
                  return (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, ratio * 80)}px`, backgroundColor: d.price >= params.initialPrice ? RED : GREEN, opacity: 0.7 }} />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs mt-1" style={{ color: TEXT_MUTED }}>
                <span>低: {result.priceLow.toFixed(0)}</span>
                <span>初: {params.initialPrice}</span>
                <span>高: {result.priceHigh.toFixed(0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 历史模拟日志 ── */}
        {activeTab === "log" && (() => {
          // 月份显示名映射（支持2024和2025）
          const monthLabelMap: Record<string, string> = {
            '2023_01':'1月','2023_02':'2月','2023_03':'3月','2023_04':'4月',
            '2023_05':'5月','2023_06':'6月','2023_07':'7月','2023_08':'8月',
            '2023_09':'9月','2023_10':'10月','2023_11':'11月','2023_12':'12月',
            '2024_01':'1月','2024_02':'2月','2024_03':'3月','2024_04':'4月',
            '2024_05':'5月','2024_06':'6月','2024_07':'7月','2024_08':'8月',
            '2024_09':'9月','2024_10':'10月','2024_11':'11月','2024_12':'12月',
            '2025_01':'1月','2025_02':'2月','2025_03':'3月','2025_04':'4月',
            '2025_05':'5月','2025_06':'6月','2025_07':'7月','2025_08':'8月',
            '2025_09':'9月','2025_10':'10月','2025_11':'11月','2025_12':'12月',
          };
          // 按年份分组，每个月只保留最新一条（gridInterval=50的）
          const getYear = (entry: SimLogEntry) => {
            const m = entry.months[0] || '';
            const yr = m.split('_')[0];
            return yr || 'other';
          };
          const getMonthNum = (entry: SimLogEntry) => {
            const m = entry.months[0] || '';
            return parseInt(m.split('_')[1] || '0', 10);
          };
          // 过滤：只取单月记录、gridInterval=50
          const singleMonthLogs = simLogs.filter(e => e.months.length === 1 && e.params.gridInterval === 50);
          // 收集所有有数据的年份（降序排列）
          const allYears = Array.from(new Set(singleMonthLogs.map(e => getYear(e)).filter(y => y !== 'other'))).sort((a, b) => Number(b) - Number(a));
          // 每月只保留最新一条
          const dedup = (logs: SimLogEntry[]) => {
            const map = new Map<number, SimLogEntry>();
            logs.forEach(e => {
              const mn = getMonthNum(e);
              const existing = map.get(mn);
              if (!existing || new Date(e.createdAt) > new Date(existing.createdAt)) {
                map.set(mn, e);
              }
            });
            return Array.from(map.values()).sort((a, b) => getMonthNum(a) - getMonthNum(b));
          };
          // 当前选中年份的数据
          const activeYearRows = dedup(singleMonthLogs.filter(e => getYear(e) === activeYearTab));

          // 渲染年度Table
          const renderYearTable = (year: string, rows: SimLogEntry[]) => {
            if (rows.length === 0) return null;
            // 计算全年汇总
            const totalNet = rows.reduce((s, e) => s + e.summary.totalNet, 0);
            const totalInit = rows.reduce((s, e) => {
              const slots = e.params.numGridsUp + e.params.numGridsDown + 1;
              return s + e.perSlotFund * slots;
            }, 0);
            const avgRoi = totalInit > 0 ? (totalNet / totalInit * 100) : 0;
            return (
              <div key={year} className="mb-4">
                {/* 年份标题 */}
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{year}年 逐月回测</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                    background: avgRoi >= 0 ? '#fef2f2' : '#f0fdf4',
                    color: avgRoi >= 0 ? RED : GREEN,
                  }}>全年合计 {avgRoi >= 0 ? '+' : ''}{avgRoi.toFixed(2)}%</span>
                </div>
                {/* Table */}
                <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  {/* 表头 */}
                  <div className="grid px-3 py-2" style={{
                    gridTemplateColumns: '2.5rem 1fr 1fr 1fr',
                    borderBottom: `1px solid ${BORDER}`,
                    background: BG_SUBTLE,
                  }}>
                    <span className="text-xs font-bold" style={{ color: TEXT_MUTED }}>月</span>
                    <span className="text-xs font-bold text-right" style={{ color: TEXT_MUTED }}>网格收益</span>
                    <span className="text-xs font-bold text-right" style={{ color: TEXT_MUTED }}>现货涨跌</span>
                    <span className="text-xs font-bold text-right" style={{ color: TEXT_MUTED }}>净利润</span>
                  </div>
                  {/* 数据行 */}
                  {rows.map((entry, idx) => {
                    const mn = getMonthNum(entry);
                    const s = entry.summary;
                    const roiColor = s.roi >= 0 ? RED : GREEN;
                    const pcColor = s.priceChange >= 0 ? RED : GREEN;
                    const diff = s.roi - s.priceChange;
                    return (
                      <div
                        key={entry.id}
                        className="grid px-3 py-2.5 cursor-pointer active:opacity-70"
                        style={{
                          gridTemplateColumns: '2.5rem 1fr 1fr 1fr',
                          borderBottom: idx < rows.length - 1 ? `1px solid ${BORDER}` : 'none',
                        }}
                        onClick={() => setLocation(`/ledger/52/grid-simulator/log/${entry.id}`)}
                      >
                        <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{mn}月</span>
                        <div className="text-right">
                          <span className="text-xs font-bold" style={{ color: roiColor }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(2)}%</span>
                          {diff !== 0 && (
                            <span className="text-xs ml-1" style={{ color: diff >= 0 ? RED : GREEN, opacity: 0.75 }}>
                              {diff >= 0 ? '↑' : '↓'}{Math.abs(diff).toFixed(1)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-right" style={{ color: pcColor }}>{s.priceChange >= 0 ? '+' : ''}{s.priceChange.toFixed(2)}%</span>
                        <span className="text-xs font-bold text-right" style={{ color: roiColor }}>{s.totalNet >= 0 ? '+' : ''}{Math.round(s.totalNet / 1000)}k</span>
                      </div>
                    );
                  })}
                  {/* 汇总行 */}
                  <div className="grid px-3 py-2" style={{
                    gridTemplateColumns: '2.5rem 1fr 1fr 1fr',
                    borderTop: `2px solid ${BORDER}`,
                    background: BG_SUBTLE,
                  }}>
                    <span className="text-xs font-bold" style={{ color: TEXT_MUTED }}>合计</span>
                    <span className="text-xs font-bold text-right" style={{ color: avgRoi >= 0 ? RED : GREEN }}>{avgRoi >= 0 ? '+' : ''}{avgRoi.toFixed(2)}%</span>
                    <span className="text-xs text-right" style={{ color: TEXT_MUTED }}>—</span>
                    <span className="text-xs font-bold text-right" style={{ color: totalNet >= 0 ? RED : GREEN }}>{totalNet >= 0 ? '+' : ''}{Math.round(totalNet / 1000)}k</span>
                  </div>
                </div>
                <p className="text-xs mt-1 px-1" style={{ color: TEXT_MUTED }}>点击月份行可查看完整报告 · 净利润单位：千u（k）</p>
              </div>
            );
          };

          // 其他（多月/非标准）日志列表
          const otherLogs = simLogs.filter(e => e.months.length > 1 || e.params.gridInterval !== 50);

          return (
            <div className="px-4 space-y-2">
              {simLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20" style={{ color: TEXT_MUTED }}>
                  <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">暂无模拟记录，请先运行一次模拟测算</p>
                </div>
              ) : (
                <>
                  {/* 横向年份Tab */}
                  {allYears.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 mb-1" style={{ scrollbarWidth: 'none' }}>
                      {allYears.map(yr => (
                        <button
                          key={yr}
                          onClick={() => setActiveYearTab(yr)}
                          className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-all"
                          style={{
                            background: activeYearTab === yr ? ACCENT : BG_SUBTLE,
                            color: activeYearTab === yr ? '#fff' : TEXT_MUTED,
                            border: `1px solid ${activeYearTab === yr ? ACCENT : BORDER}`,
                          }}
                        >
                          {yr}年
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 当前年份Table */}
                  {renderYearTable(activeYearTab, activeYearRows)}
                  {/* 其他多月/非标准记录 */}
                  {otherLogs.map((entry) => {
                    const dt = new Date(entry.createdAt);
                    const dateStr = `${dt.getMonth()+1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                    const monthLabels = entry.months.map(v => monthLabelMap[v] ?? v).join('、');
                    const yearLabel = (entry.months[0] || '').startsWith('2023') ? '2023年' : (entry.months[0] || '').startsWith('2024') ? '2024年' : '2025年';
                    const roiColor = entry.summary.roi >= 0 ? RED : GREEN;
                    const totalSlots = entry.params.numGridsUp + entry.params.numGridsDown + 1;
                    const totalPool = entry.perSlotFund * totalSlots;
                    return (
                      <SwipeToDelete key={entry.id} onDelete={() => deleteGridSimLogMutation.mutate({ id: Number(entry.id) })}>
                        <div className="rounded-md overflow-hidden" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                          <div className="px-4 pt-3 pb-2.5 cursor-pointer" onClick={() => setLocation(`/ledger/52/grid-simulator/log/${entry.id}`)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold" style={{ color: ACCENT }}>{yearLabel} {monthLabels}</span>
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>{dateStr}</span>
                              </div>
                              <span className="text-sm font-bold" style={{ color: roiColor }}>{entry.summary.roi >= 0 ? '+' : ''}{entry.summary.roi.toFixed(2)}%</span>
                            </div>
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs" style={{ color: TEXT_MUTED }}>基准价 <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{entry.params.initialPrice.toLocaleString()} u</span></span>
                              <span className="text-xs" style={{ color: TEXT_MUTED }}>间隔 <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{entry.params.gridInterval} u</span></span>
                              <span className="text-xs" style={{ color: TEXT_MUTED }}>岗位 <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{totalSlots}人</span></span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>净利润</span>
                                <span className="text-xs font-bold" style={{ color: roiColor }}>{entry.summary.totalNet >= 0 ? '+' : ''}{Math.round(entry.summary.totalNet).toLocaleString()} u</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>止盈</span>
                                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{entry.summary.totalSellTrades}次</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>总池</span>
                                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{(totalPool / 10000).toFixed(0)}万 u</span>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-2.5 flex items-center justify-end" style={{ borderTop: `1px solid ${BORDER}` }}>
                            <span className="text-xs" style={{ color: ACCENT }}>查看完整报告 ›</span>
                          </div>
                        </div>
                      </SwipeToDelete>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {/* 无结果提示 */}
        {(activeTab === "result" || activeTab === "chart") && !result && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: TEXT_MUTED }}>
            <Play className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">请先配置参数并运行模拟</p>
          </div>
        )}
      </div>

      {/* ── 底部运行按钮 ── */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3" style={{ background: `linear-gradient(to top, ${BG_PAGE} 70%, transparent)`, maxWidth: 480, margin: '0 auto' }}>
        <button
          onClick={handleRun}
          disabled={running || klineLoading}
          className="w-full h-12 rounded-md font-bold text-sm flex items-center justify-center gap-2 transition-all"
          style={{
            background: (running || klineLoading) ? BG_SUBTLE : `linear-gradient(135deg, ${ACCENT}, #3b82f6)`,
            color: (running || klineLoading) ? TEXT_MUTED : '#fff',
          }}
        >
          {running ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              {runStep === 1 ? '正在读K线数据...' : runStep === 2 ? '正在计算网格交易...' : '正在统计收益分配...'}
            </>
          ) : klineLoading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              正在加载K线数据...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              开始模拟测算
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── 子组件：带问号Tooltip的参数行 ───────────────────────────────
function WhiteParamRowWithTip({ label, unit, value, min, max, step, onChange, tip }: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; tip: string;
}) {
  const [inputVal, setInputVal] = React.useState(String(value));
  const [showTip, setShowTip] = React.useState(false);
  React.useEffect(() => { setInputVal(String(value)); }, [value]);
  return (
    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-1 w-24 flex-shrink-0">
          <span className="text-xs" style={{ color: TEXT_SUB }}>{label}</span>
          <button
            onClick={() => setShowTip(v => !v)}
            className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs"
            style={{ background: showTip ? ACCENT : ACCENT_LIGHT, color: showTip ? '#fff' : ACCENT, border: `1px solid ${ACCENT_LIGHT}` }}
          >?</button>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onInput={e => onChange(Number((e.target as HTMLInputElement).value))}
          className="flex-1" style={{ accentColor: ACCENT }} />
        <div className="flex items-center gap-1 w-20 justify-end">
          <input
            type="text" inputMode="numeric" value={inputVal}
            onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); setInputVal(raw); const n = parseFloat(raw); if (!isNaN(n) && n >= min && n <= max) onChange(n); }}
            onBlur={() => { const n = parseFloat(inputVal); const clamped = isNaN(n) ? min : Math.min(max, Math.max(min, n)); onChange(clamped); setInputVal(String(clamped)); }}
            className="w-14 rounded-lg px-2 py-1 text-xs text-right outline-none"
            style={{ background: BG_SUBTLE, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}
          />
          <span className="text-xs w-4" style={{ color: TEXT_MUTED }}>{unit}</span>
        </div>
      </div>
      {showTip && (
        <div className="mx-4 mb-3 px-3 py-2.5 rounded-md text-xs leading-relaxed" style={{ background: ACCENT_BG, color: TEXT_SUB, border: `1px solid ${ACCENT_LIGHT}` }}>
          {tip}
        </div>
      )}
    </div>
  );
}

// ─── 子组件：白色主题参数行 ─────────────────────────────────
function WhiteParamRow({ label, unit, value, min, max, step, onChange }: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  const [inputVal, setInputVal] = React.useState(String(value));
  React.useEffect(() => { setInputVal(String(value)); }, [value]);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-xs w-24 flex-shrink-0" style={{ color: TEXT_SUB }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onInput={e => onChange(Number((e.target as HTMLInputElement).value))}
        className="flex-1" style={{ accentColor: ACCENT }} />
      <div className="flex items-center gap-1 w-20 justify-end">
        <input
          type="text" inputMode="numeric" value={inputVal}
          onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); setInputVal(raw); const n = parseFloat(raw); if (!isNaN(n) && n >= min && n <= max) onChange(n); }}
          onBlur={() => { const n = parseFloat(inputVal); const clamped = isNaN(n) ? min : Math.min(max, Math.max(min, n)); onChange(clamped); setInputVal(String(clamped)); }}
          className="w-14 rounded-lg px-2 py-1 text-xs text-right outline-none"
          style={{ background: BG_SUBTLE, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}
        />
        <span className="text-xs w-4" style={{ color: TEXT_MUTED }}>{unit}</span>
      </div>
    </div>
  );
}

function WhiteNonLinearRow({ label, unit, value, options, onChange }: {
  label: string; unit: string; value: number; options: number[];
  onChange: (v: number) => void;
}) {
  const idx = options.indexOf(value) >= 0 ? options.indexOf(value) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-xs w-24 flex-shrink-0" style={{ color: TEXT_SUB }}>{label}</span>
      <input type="range" min={0} max={options.length - 1} step={1} value={idx}
        onInput={e => onChange(options[Number((e.target as HTMLInputElement).value)])}
        className="flex-1" style={{ accentColor: ACCENT }} />
      <div className="flex items-center gap-1 w-20 justify-end">
        <span className="w-14 rounded-lg px-2 py-1 text-xs text-right" style={{ background: BG_SUBTLE, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}>{value}</span>
        <span className="text-xs w-4" style={{ color: TEXT_MUTED }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── 子组件：净值折线图（SVG）──────────────────────────────
function NetValueChart({ data, participants, colors }: {
  data: { idx: number; price: number; values: Record<string, number> }[];
  participants: Participant[];
  colors: string[];
}) {
  if (!data.length) return null;
  const W = 340, H = 200;
  const pad = { top: 10, right: 10, bottom: 20, left: 50 };
  const iW = W - pad.left - pad.right, iH = H - pad.top - pad.bottom;
  const allVals = data.flatMap(d => Object.values(d.values));
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const x = (i: number) => pad.left + (i / Math.max(1, data.length - 1)) * iW;
  const y = (v: number) => pad.top + iH - ((v - minV) / range) * iH;
  const showParticipants = participants.slice(0, 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {[0, 0.5, 1].map(t => {
        const val = minV + t * range;
        return (
          <text key={t} x={pad.left - 4} y={pad.top + iH - t * iH + 4} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
            {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val.toFixed(0)}
          </text>
        );
      })}
      {[0, 0.5, 1].map(t => (
        <line key={t} x1={pad.left} x2={W - pad.right} y1={pad.top + iH - t * iH} y2={pad.top + iH - t * iH} stroke={BORDER} strokeWidth={1} />
      ))}
      {showParticipants.map((p, i) => {
        const pts = data.map((d, di) => `${x(di)},${y(d.values[p.id] ?? minV)}`).join(" ");
        return <polyline key={p.id} points={pts} fill="none" stroke={colors[i % colors.length]} strokeWidth={1.5} strokeLinejoin="round" />;
      })}
    </svg>
  );
}
