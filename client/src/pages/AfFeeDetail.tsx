import React, { useState, useMemo, useRef } from 'react';
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, DollarSign } from "lucide-react";
import Tooltip from "@/components/Tooltip";
import { trpc } from "@/lib/trpc";

// 持币量格式化：整数位数 + 小数位数 = 5位，不足补0
function formatQty(val: string | number): string {
  const n = parseFloat(String(val) || '0');
  if (isNaN(n)) return '0.0000';
  const intPart = Math.floor(Math.abs(n)).toString();
  const intLen = intPart === '0' ? 1 : intPart.length;
  const decLen = Math.max(0, 5 - intLen);
  return n.toFixed(decLen);
}

const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// 权益折扣档位 → 用户实际仍拥有的资金比例
const EQUITY_DISCOUNT_RATES: Record<number, number> = {
  0: 1.0, 1: 0.6667, 2: 0.4444, 3: 0.3333, 4: 0.2667,
  5: 0.2222, 6: 0.1905, 7: 0.1667, 8: 0.1481, 9: 0.1333,
};

function calcFeeItem(o: any) {
  const amount = parseFloat(o.amount || '0');
  const tradeValue = o.isGift ? amount : amount * 5.25;
  const dailyFee = tradeValue / 0.75 * 0.12 / 365;
  const confirmedDate = new Date(o.createdAt);
  const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
  let holdDays: number;
  let feeType: 'ongoing' | 'settled';
  if (o.sellStatus === 'sold' && o.sellConfirmedAt) {
    const sellDate = new Date(o.sellConfirmedAt);
    const sellDay = new Date(sellDate.getFullYear(), sellDate.getMonth(), sellDate.getDate());
    holdDays = Math.max(1, Math.floor((sellDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    feeType = 'settled';
  } else {
    holdDays = Math.max(1, Math.floor((todayStart.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    feeType = 'ongoing';
  }
  const totalFee = dailyFee * holdDays;
  // 按年化 12% 口径：日费率 = 订单价值 × 0.12 ÷ 365，累计 = × 持有天数
  const dailyFee12 = tradeValue * 0.12 / 365;
  const totalFee12 = dailyFee12 * holdDays;
  // 名义年化费率 与 实际年化费率（按档位折扣率折算）
  const nominalApr = tradeValue > 0 ? (dailyFee * 365 / tradeValue) : 0;
  const equityTier = o.equityTier || 0;
  let discountRate: number;
  if (o.tierMode === 'linear') {
    const buyP = parseFloat(o.limitPrice || '0');
    const allLow = o.allTimeLowPrice ? parseFloat(String(o.allTimeLowPrice)) : 0;
    discountRate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
  } else {
    discountRate = EQUITY_DISCOUNT_RATES[equityTier] ?? 1.0;
  }
  const actualApr = discountRate > 0 ? (nominalApr / discountRate) : nominalApr;
  const orderDate = new Date(o.createdAt);
  const yy = String(orderDate.getFullYear()).slice(2);
  const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
  const dd = String(orderDate.getDate()).padStart(2, '0');
  const orderNo = `AF${yy}${mm}${dd}${String(o.id).padStart(6, '0')}`;
  return { ...o, orderNo, holdDays, dailyFee, totalFee, dailyFee12, totalFee12, feeType, tradeValue, nominalApr, actualApr, equityTier, discountRate };
}

export default function AfFeeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [feeFilter, setFeeFilter] = useState<'all' | 'ongoing' | 'settled' | 'byDate' | 'byPerson' | 'byCoin'>('all');
  const [expandedCoins, setExpandedCoins] = useState<Set<string>>(new Set());
  const toggleCoin = (c: string) => setExpandedCoins(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const toggleDate = (d: string) => setExpandedDates(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  type DateSortKey = 'nickname' | 'id' | 'tier' | 'coin' | 'quantity' | 'amount' | 'dailyFee';
  const [dateSortConfig, setDateSortConfig] = useState<Record<string, { key: DateSortKey; asc: boolean }>>({});
  const handleDateSort = (dateKey: string, key: DateSortKey) => {
    setDateSortConfig(prev => {
      const cur = prev[dateKey];
      if (cur && cur.key === key) return { ...prev, [dateKey]: { key, asc: !cur.asc } };
      return { ...prev, [dateKey]: { key, asc: false } };
    });
  };
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const togglePerson = (uid: string) => setExpandedPersons(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const [aprInfo, setAprInfo] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [finDetailOrder, setFinDetailOrder] = useState<any | null>(null);
  // 预收管理费弹窗
  const [collectModal, setCollectModal] = useState<{ order: any; totalFee: number; prepaidFee: number } | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectLoading, setCollectLoading] = useState(false);
  const collectMutation = trpc.ledger.afAdminCollectPrepaidFee.useMutation();
  const utils = trpc.useUtils();
  // 表格排序：点表头切换字段与正/倒序
  const [sortKey, setSortKey] = useState<'holdDays' | 'totalFee' | 'nominalApr' | 'actualApr' | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const toggleSort = (key: 'holdDays' | 'totalFee' | 'nominalApr' | 'actualApr') => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // 顶部主 Tab：谷底增筹（当前 af_orders）/ 融资付息（ledger_orders, finance）
  // 谷底增筹搜索关键词
  const [gujianSearch, setGujianSearch] = useState('');
  // 融资付息订单表格排序
  const [finSortKey, setFinSortKey] = useState<string | null>(null);
  const [finSortAsc, setFinSortAsc] = useState(true);
  // 融资付息订单搜索关键词
  const [finSearch, setFinSearch] = useState('');
  // 融资付息分组筛选：列表/按日期/按人员/按币种
  const [finGroupFilter, setFinGroupFilter] = useState<'list' | 'byDate' | 'byPerson' | 'byCoin'>('list');
  // 融资付息收/付方向筛选：全部/我方收息/我方付息
  const [finDirectionFilter, setFinDirectionFilter] = useState<'all' | 'collect' | 'pay'>('all');
  // 融资付息天数Tooltip
  const [finDaysTooltip, setFinDaysTooltip] = useState<{ orderId: number; start: string; days: number } | null>(null);
  const finDaysTriggerRef = useRef<HTMLButtonElement | null>(null);
  // 计息本金折算详情Tooltip
  const [finBaseTooltip, setFinBaseTooltip] = useState<{ orderId: number; coin: string; baseRaw: number; baseU: number; rate: number } | null>(null);
  const finBaseTriggerRef = useRef<HTMLElement | null>(null);
  // 融资付息收费弹窗
  const [finChargeModal, setFinChargeModal] = useState<{ order: any } | null>(null);
  // 已付利息记录弹窗
  const [finPaidDetailOrderId, setFinPaidDetailOrderId] = useState<number | null>(null);
  const [finChargeAmount, setFinChargeAmount] = useState('');
  const [finChargeDate, setFinChargeDate] = useState(new Date().toISOString().slice(0, 10));
  const [finChargeNote, setFinChargeNote] = useState('');
  const [finChargeLoading, setFinChargeLoading] = useState(false);
  const addFinPaymentMutation = trpc.ledger.financeAddInterestPayment.useMutation({
    onSuccess: () => {
      setFinChargeModal(null);
      setFinChargeAmount('');
      setFinChargeNote('');
      utils.ledger.financeGetInterestPaymentSummary.invalidate();
      utils.ledger.financeGetInterestPayments.invalidate();
    },
    onError: (e: any) => alert('收费失败：' + e.message),
  });
  const toggleFinSort = (key: string) => {
    if (finSortKey === key) {
      setFinSortAsc(prev => !prev);
    } else {
      setFinSortKey(key);
      setFinSortAsc(true);
    }
  };
  // 收息判断：年利率 > 0（正数）= 收息
  //           年利率 = 0 或 < 0（零或负数）= 付息
  //           年利率为 null 时默认付息
  // 不依赖 principal_lent_out 字段，统一以年利率为准
  const isCollect = (o: any) => {
    const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
    return rate != null && rate > 0;
  };

  const [mainTab, setMainTab] = useState<'gujian' | 'finance'>('gujian');

  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 融资付息订单（仅切到该 Tab 时加载）
  const { data: financeOrdersData, isLoading: financeLoading } = trpc.ledger.financeGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && mainTab === 'finance' }
  );
  const financeOrdersRaw: any[] = Array.isArray((financeOrdersData as any)?.orders)
    ? (financeOrdersData as any).orders
    : (Array.isArray(financeOrdersData) ? (financeOrdersData as any) : []);
  // 保留 finance 和 funder 主订单（均为管理员在 ledger_orders 表开的单），不过滤 _isParticipant
  // 谷底增筹是 af_orders 表，与此处完全不同的数据源，不会重叠
  const financeOrders: any[] = financeOrdersRaw.filter(
    (o: any) => o.order_role == null || o.order_role === 'finance' || o.order_role === 'funder'
  );
  // 实时 CNY/USDT 汇率（3秒刷新）
  const { data: cnyRateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { staleTime: 3000, refetchInterval: 3000, enabled: !!ledgerId && mainTab === 'finance' }
  );
  const cnyRate = parseFloat((cnyRateData as any)?.money ?? '7.25') || 7.25;

  // 已付利息汇总（按订单聚合）
  const finOrderIds = useMemo(
    () => financeOrders.map((o: any) => o.id).filter(Boolean),
    [financeOrders]
  );
  const { data: finPaidSummary } = trpc.ledger.financeGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds: finOrderIds },
    { enabled: !!ledgerId && mainTab === 'finance' && finOrderIds.length > 0 }
  );
  const finPaidMap: Record<number, number> = (finPaidSummary as any) || {};
  // 已付利息记录弹窗查询
  const { data: finPaidDetailPayments } = trpc.ledger.financeGetInterestPayments.useQuery(
    { ledgerId, orderId: finPaidDetailOrderId! },
    { enabled: !!finPaidDetailOrderId && !!ledgerId }
  );
  const finPaidDetailList = Array.isArray(finPaidDetailPayments) ? finPaidDetailPayments : [];

  const feeItems = ((orders as any[]) ?? [])
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map(calcFeeItem);

  const userMap = new Map<string, { userId: string; nickname: string; username: string; orders: ReturnType<typeof calcFeeItem>[] }>();
  for (const item of feeItems) {
    const uid = String(item.userId || item.username || 'unknown');
    const nickname = item.nickname || item.username || uid;
    const username = item.username || '';
    if (!userMap.has(uid)) {
      userMap.set(uid, { userId: uid, nickname, username, orders: [] });
    }
    userMap.get(uid)!.orders.push(item);
  }

  const userGroups = Array.from(userMap.values()).map(u => {
    const ongoingFee = u.orders.filter(o => o.feeType === 'ongoing').reduce((s, o) => s + o.totalFee, 0);
    const settledFee = u.orders.filter(o => o.feeType === 'settled').reduce((s, o) => s + o.totalFee, 0);
    const totalFee = ongoingFee + settledFee;
    const ongoingCount = u.orders.filter(o => o.feeType === 'ongoing').length;
    const settledCount = u.orders.filter(o => o.feeType === 'settled').length;
    return { ...u, ongoingFee, settledFee, totalFee, ongoingCount, settledCount };
  }).sort((a, b) => b.totalFee - a.totalFee);

  const gujianKw = gujianSearch.trim().toLowerCase();
  const filteredGroups = userGroups.map(g => ({
    ...g,
    orders: g.orders.filter(o => {
      // 状态筛选
      if (feeFilter !== 'all' && o.feeType !== feeFilter) return false;
      // 搜索关键词过滤
      if (gujianKw) {
        const nick = (o.nickname || o.username || '').toLowerCase();
        const orderNo = (o.orderNo || '').toLowerCase();
        const coin = (o.coin || '').toLowerCase();
        if (!nick.includes(gujianKw) && !orderNo.includes(gujianKw) && !coin.includes(gujianKw)) return false;
      }
      return true;
    }),
  })).filter(g => g.orders.length > 0);

  // 批量查询各成员的【全局】钱包余额（口径与钱包页一致）
  const memberUserIds = Array.from(
    new Set(userGroups.map(g => parseInt(g.userId)).filter(n => Number.isFinite(n) && n > 0))
  );
  const { data: memberBalances } = trpc.recharge.getMembersBalance.useQuery(
    { userIds: memberUserIds },
    { enabled: memberUserIds.length > 0 }
  );

  const totalOngoing = feeItems.filter(f => f.feeType === 'ongoing').reduce((s, f) => s + f.totalFee, 0);
  const totalSettled = feeItems.filter(f => f.feeType === 'settled').reduce((s, f) => s + f.totalFee, 0);
  const totalAll = totalOngoing + totalSettled;

  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  return (
    <div className="min-h-screen pb-10" style={{ background: '#f5f7fa' }}>

      {/* ── 顶部蓝色区域 ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' }}>
        {/* 导航栏 */}
        <div className="flex items-center px-4 pt-5 pb-1">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full mr-3"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-white font-semibold text-base">管理费明细</span>
          {/* 右上角主 Tab：谷底增筹 / 融资付息 */}
          <div className="ml-auto flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.14)' }}>
            {([
              { key: 'gujian' as const, label: '谷底增筹' },
              { key: 'finance' as const, label: '融资付息' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setMainTab(t.key)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={mainTab === t.key
                  ? { background: '#fff', color: '#1e3a8a' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 蓝色汇总区域：按 tab 分别显示 */}
        {mainTab === 'gujian' ? (() => {
          // 谷底增筹：管理费进行中/已结清/累计 + 今日
          const nowBJ = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
          const todayStartBJ = new Date(nowBJ.getFullYear(), nowBJ.getMonth(), nowBJ.getDate());
          let todayFee = 0;
          let todayOrderCount = 0;
          for (const item of feeItems) {
            if (item.feeType === 'settled') {
              const sellDate = item.sellConfirmedAt ? new Date(item.sellConfirmedAt) : null;
              if (sellDate) {
                const sellBJ = new Date(sellDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                const sellDay = new Date(sellBJ.getFullYear(), sellBJ.getMonth(), sellBJ.getDate());
                if (sellDay.getTime() >= todayStartBJ.getTime()) { todayFee += item.dailyFee; todayOrderCount += 1; }
              }
            } else {
              todayFee += item.dailyFee;
              todayOrderCount += 1;
            }
          }
          return (
            <div className="grid grid-cols-2 gap-2 px-4 pb-5 pt-3">
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">管理费</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">进行中</span>
                    <span className="text-amber-300 font-semibold">{totalOngoing.toFixed(2)} U</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">已结清</span>
                    <span className="text-emerald-300 font-semibold">{totalSettled.toFixed(2)} U</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                    <span className="text-white/70">累计</span>
                    <span className="text-white font-bold">{totalAll.toFixed(2)} U</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">今日</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">管理费</span>
                    <span className="text-sky-300 font-semibold">{todayFee.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">订单数</span>
                    <span className="text-white font-bold">{todayOrderCount} 单</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })() : (() => {
          // 融资付息：收息/付息/日息汇总
          const ongoingOrders = financeOrders.filter((o: any) => o.status === 'active');
          const getBase = (o: any) => {
            const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
            return o.coin === 'CNY' ? raw / cnyRate : raw;
          };
          const getDailyAbs = (o: any) => {
            const b = getBase(o);
            const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
            return (b && r != null) ? Math.abs(b * (r / 100) / 365) : 0;
          };
          const collectOrders = ongoingOrders.filter((o: any) => isCollect(o));
          const payOrders = ongoingOrders.filter((o: any) => !isCollect(o));
          const collectDailyTotal = collectOrders.reduce((s: number, o: any) => s + getDailyAbs(o), 0);
          const payDailyTotal = payOrders.reduce((s: number, o: any) => s + getDailyAbs(o), 0);
          const netDaily = collectDailyTotal - payDailyTotal;
          const collectBaseTotal = collectOrders.reduce((s: number, o: any) => s + getBase(o), 0);
          const payBaseTotal = payOrders.reduce((s: number, o: any) => s + getBase(o), 0);
          return (
            <div className="grid grid-cols-2 gap-2 px-4 pb-5 pt-3">
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">利息（进行中）</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">收息日息</span>
                    <span className="text-emerald-300 font-semibold">+{collectDailyTotal.toFixed(2)} U</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">付息日息</span>
                    <span className="text-rose-300 font-semibold">-{payDailyTotal.toFixed(2)} U</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                    <span className="text-white/70">净日息</span>
                    <span className={`font-bold ${netDaily >= 0 ? 'text-white' : 'text-rose-300'}`}>{netDaily >= 0 ? '+' : ''}{netDaily.toFixed(2)} U</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">本金规模（进行中）</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">收息本金</span>
                    <span className="text-emerald-300 font-semibold">{collectBaseTotal.toFixed(0)} U</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">付息本金</span>
                    <span className="text-rose-300 font-semibold">{payBaseTotal.toFixed(0)} U</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                    <span className="text-white/70">订单数</span>
                    <span className="text-white font-bold">{ongoingOrders.length} 单</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── 筛选 Tab（仅谷底增筹） ── */}
      {mainTab === 'gujian' && (
      <div className="bg-white border-b border-gray-100 px-3 py-2 sticky top-0 z-10">
        {/* 搜索框 */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-2 border border-gray-100">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
          <input
            type="text"
            value={gujianSearch}
            onChange={e => setGujianSearch(e.target.value)}
            placeholder="搜索用户名、订单号、币种…"
            className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
          />
          {gujianSearch && (
            <button type="button" onClick={() => setGujianSearch('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          {(['all', 'ongoing', 'settled'] as const).map(key => {
            const label = key === 'all' ? `全部 ${userGroups.length} 人` : key === 'ongoing' ? '进行中' : '已结清';
            return (
              <button key={key} onClick={() => setFeeFilter(key)}
                className="flex-1 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                style={feeFilter === key ? { background: '#2563eb', color: '#fff' } : { background: '#eff2f9', color: '#6b7280' }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {(['byDate', 'byPerson', 'byCoin'] as const).map(key => {
            const label = key === 'byDate' ? '按日期' : key === 'byPerson' ? '按人员' : '按币种';
            return (
              <button key={key} onClick={() => setFeeFilter(key)}
                className="flex-1 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                style={feeFilter === key ? { background: '#2563eb', color: '#fff' } : { background: '#eff2f9', color: '#6b7280' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* ── 谷底增筹：按日期视图 ── */}
      {mainTab === 'gujian' && feeFilter === 'byDate' && (
      <div className="px-3 pt-3 pb-10">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : (() => {
          // 按天展开：每个订单在其持仓区间内的每天都产生日费
          // dateMap: 日期字符串 -> 当天活跃的订单列表
          const dateMap = new Map<string, typeof feeItems>();
          const todayBJ = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
          const todayKey = `${todayBJ.getFullYear()}-${String(todayBJ.getMonth()+1).padStart(2,'0')}-${String(todayBJ.getDate()).padStart(2,'0')}`;
          for (const item of feeItems) {
            // 开仓日（北京时间）
            const startBJ = new Date(new Date(item.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
            const startDay = new Date(startBJ.getFullYear(), startBJ.getMonth(), startBJ.getDate());
            // 结束日：已卖出用卖出日，否则用今天
            let endDay: Date;
            if (item.feeType === 'settled' && item.sellConfirmedAt) {
              const sellBJ = new Date(new Date(item.sellConfirmedAt).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
              endDay = new Date(sellBJ.getFullYear(), sellBJ.getMonth(), sellBJ.getDate());
            } else {
              endDay = new Date(todayBJ.getFullYear(), todayBJ.getMonth(), todayBJ.getDate());
            }
            // 按天展开
            const cur = new Date(startDay);
            while (cur <= endDay) {
              const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
              if (!dateMap.has(key)) dateMap.set(key, []);
              // 避免同一天同一订单重复添加
              const existing = dateMap.get(key)!;
              if (!existing.find((x: any) => x.id === item.id)) existing.push(item);
              cur.setDate(cur.getDate() + 1);
            }
          }
          const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
          if (sortedDates.length === 0) return <div className="text-center py-16 text-gray-400 text-sm">暂无记录</div>;
          // 当前每日总费率 = 今天所有活跃订单的日费率之和
          const todayItems = dateMap.get(todayKey) || [];
          const currentDailyTotal = todayItems.reduce((s: number, i: any) => s + i.dailyFee, 0);
          const monthlyForecast = currentDailyTotal * 30;
          const yearlyForecast = currentDailyTotal * 365;
          return (
            <div className="space-y-2">
              {/* 预测卡片 */}
              <div className="rounded shadow-sm px-4 py-3 flex gap-3" style={{background:'linear-gradient(135deg,#eff6ff 0%,#e0f2fe 100%)',border:'1px solid #bfdbfe'}}>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">每日（当前）</p>
                  <p className="text-sm font-bold text-gray-700">{currentDailyTotal.toFixed(2)} <span className="text-[10px] font-normal text-gray-400">U/天</span></p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">月预测（×30）</p>
                  <p className="text-sm font-bold text-blue-600">{Math.round(monthlyForecast)} <span className="text-[10px] font-normal text-gray-400">U</span></p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">年预测（×365）</p>
                  <p className="text-sm font-bold text-emerald-600">{Math.round(yearlyForecast)} <span className="text-[10px] font-normal text-gray-400">U</span></p>
                </div>
              </div>
              {sortedDates.map(dateKey => {
                const items = dateMap.get(dateKey)!;
                const totalFee = items.reduce((s, i) => s + i.dailyFee, 0);
                const totalOrders = items.length;
                const isOpen = expandedDates.has(dateKey);
                const _dsc = dateSortConfig[dateKey] || { key: 'dailyFee' as DateSortKey, asc: false };
                const _sortKey = _dsc.key;
                const _sortAsc = _dsc.asc;
                const sortedItems = [...items].sort((a, b) => {
                  let av: any, bv: any;
                  if (_sortKey === 'nickname') { av = (a.nickname || a.username || '').toLowerCase(); bv = (b.nickname || b.username || '').toLowerCase(); return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
                  if (_sortKey === 'id') { av = String(a.id).padStart(4,'0').slice(-4); bv = String(b.id).padStart(4,'0').slice(-4); return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
                  if (_sortKey === 'tier') { av = (a as any).tierMode === 'linear' ? 'L' : `D${a.equityTier}`; bv = (b as any).tierMode === 'linear' ? 'L' : `D${b.equityTier}`; return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
                  if (_sortKey === 'coin') { av = (a.coin||'').toLowerCase(); bv = (b.coin||'').toLowerCase(); return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
                  if (_sortKey === 'quantity') { av = parseFloat((a as any).quantity||'0'); bv = parseFloat((b as any).quantity||'0'); }
                  else if (_sortKey === 'amount') { av = parseFloat(a.amount||'0'); bv = parseFloat(b.amount||'0'); }
                  else { av = a.dailyFee; bv = b.dailyFee; }
                  return _sortAsc ? av - bv : bv - av;
                });
                const sortIcon = (key: DateSortKey) => _sortKey === key ? (_sortAsc ? ' ↑' : ' ↓') : '';
                const parts = dateKey.split('-');
                const shortDate = `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
                return (
                  <div key={dateKey} className="bg-white rounded shadow-sm overflow-hidden">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDate(dateKey); }}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{shortDate}</span>
                        <span className="text-xs text-gray-400">{totalOrders}单</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-600">{totalFee.toFixed(4)} U</span>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100">
                        {/* 表格 */}
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                          <thead>
                            <tr className="bg-gray-50">
                              <th onClick={() => handleDateSort(dateKey, 'nickname')} className="text-[9px] font-normal text-gray-400 text-left px-3 py-1 border-r border-b border-gray-200 cursor-pointer select-none">用户{sortIcon('nickname')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'id')} className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-10 cursor-pointer select-none">尾号{sortIcon('id')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'tier')} className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-10 cursor-pointer select-none">档位{sortIcon('tier')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'coin')} className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-12 cursor-pointer select-none">币种{sortIcon('coin')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'quantity')} className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-14 cursor-pointer select-none">持币量{sortIcon('quantity')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'amount')} className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-16 cursor-pointer select-none">持仓金额{sortIcon('amount')}</th>
                              <th onClick={() => handleDateSort(dateKey, 'dailyFee')} className="text-[9px] font-normal text-gray-400 text-right px-3 py-1 border-b border-gray-200 w-18 cursor-pointer select-none">当日费用{sortIcon('dailyFee')}</th>
                            </tr>
                          </thead>
                          <tbody>
                          {sortedItems.map((item, idx) => (
                            <tr key={item.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td className="text-[11px] font-medium text-gray-700 truncate px-3 py-1.5 border-r border-gray-200 max-w-0" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nickname || item.username}</td>
                              <td className="text-[10px] text-gray-400 text-center px-2 py-1.5 border-r border-gray-200 font-mono">{String(item.id).padStart(4, '0').slice(-4)}</td>
                              <td className="text-[10px] text-center px-2 py-1.5 border-r border-gray-200 font-semibold" style={{ color: (item as any).tierMode === 'linear' ? '#3B82F6' : '#0d9488' }}>{(item as any).tierMode === 'linear' ? 'L' : `D${item.equityTier}`}</td>
                              <td className="text-[10px] text-gray-400 text-center px-2 py-1.5 border-r border-gray-200">{item.coin}</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{formatQty((item as any).quantity||'0')}</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{Math.round(parseFloat(item.amount||'0'))}u</td>
                              <td className="text-[11px] font-bold text-gray-800 text-right px-3 py-1.5">{item.dailyFee.toFixed(2)}</td>
                            </tr>
                          ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td className="text-[10px] text-gray-500 font-semibold px-3 py-1.5 border-t border-gray-200" colSpan={6}>当日合计</td>
                              <td className="text-xs font-bold text-blue-600 text-right px-3 py-1.5 border-t border-gray-200">{totalFee.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      )}

      {/* ── 谷底增筹：按人员视图 ── */}
      {mainTab === 'gujian' && feeFilter === 'byPerson' && (
      <div className="px-3 pt-3 pb-10">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : (() => {
          const personMap = new Map<string, { nickname: string; username: string; userId: number; dailyTotal: number; orders: typeof feeItems }>();
          for (const item of feeItems) {
            if (item.feeType === 'settled') continue;
            const uid = String(item.userId || item.username || 'unknown');
            const nickname = item.nickname || item.username || uid;
            const numericUserId = parseInt(uid);
            const username = item.username || '';
            if (!personMap.has(uid)) personMap.set(uid, { nickname, username, userId: Number.isFinite(numericUserId) ? numericUserId : 0, dailyTotal: 0, orders: [] });
            const p = personMap.get(uid)!;
            p.dailyTotal += item.dailyFee;
            p.orders.push(item);
          }
          const persons = Array.from(personMap.values()).sort((a, b) => b.dailyTotal - a.dailyTotal);
          if (persons.length === 0) return <div className="text-center py-16 text-gray-400 text-sm">暂无进行中订单</div>;
          return (
            <div className="space-y-2">
              {persons.map(person => {
                const uid = person.nickname;
                const isOpen = expandedPersons.has(uid);
                return (
                  <div key={uid} className="bg-white rounded shadow-sm overflow-hidden">
                    <button
                      onClick={() => togglePerson(uid)}
                      className="w-full px-4 py-3 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800">{person.nickname}</span>
                          {person.username && person.username !== person.nickname && (
                            <span className="text-[10px] text-gray-400">@{person.username}</span>
                          )}
                          <span className="text-xs text-gray-400">{person.orders.length}单</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-blue-600">{person.dailyTotal.toFixed(4)}</span>
                          <span className="text-[10px] text-gray-400">U/天</span>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                      {!isOpen && (
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px] text-gray-400">月化 <span className="text-blue-500 font-semibold">{Math.round(person.dailyTotal*30)}</span>u</span>
                          <span className="text-[10px] text-gray-400">季化 <span className="text-purple-500 font-semibold">{Math.round(person.dailyTotal*90)}</span>u</span>
                          <span className="text-[10px] text-gray-400">年化 <span className="text-emerald-500 font-semibold">{Math.round(person.dailyTotal*365)}</span>u</span>
                        </div>
                      )}
                      {/* 最后一行：钱包余额 + 应付管理费 + 状态 */}
                      {(() => {
                        const pendingFee = person.orders.reduce((s, o) => {
                          const prepaid = parseFloat((o as any).prepaidFee || '0');
                          return s + Math.max(0, o.totalFee - prepaid);
                        }, 0);
                        const walletBal = (person.userId > 0 && memberBalances) ? (memberBalances[person.userId] ?? null) : null;
                        return (
                          <div className="flex items-center gap-3 mt-1">
                            {walletBal !== null && (
                              <span className="text-[10px] text-gray-400">钱包余额 <span className="font-semibold" style={{ color: walletBal >= 0 ? '#d97706' : '#dc2626' }}>{walletBal.toFixed(2)}</span> <span className="text-gray-400">u</span></span>
                            )}
                            <span className="text-[10px] text-gray-400">应付管理费 <span className="font-semibold" style={{ color: pendingFee > 0 ? '#ea580c' : '#16a34a' }}>{pendingFee.toFixed(2)}</span> <span className="text-gray-400">u</span></span>
                            {walletBal !== null && (
                              walletBal >= pendingFee
                                ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>充足</span>
                                : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}>补 <span style={{color:'#15803d'}}>{(pendingFee - walletBal).toFixed(2)}</span> <span className="text-gray-400 font-normal">u</span></span>
                            )}
                          </div>
                        );
                      })()}
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100">
                        {/* 表格 */}
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-12">币种</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-18">持仓金额</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-14">持仓天</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-24">累计管理费</th>
                              <th className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-b border-gray-200 w-12">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                          {person.orders.sort((a, b) => b.dailyFee - a.dailyFee).map((item, idx) => {
                              const prepaidFee = parseFloat(item.prepaidFee || '0');
                              const remainingFee = Math.max(0, item.totalFee - prepaidFee);
                              return (
                            <tr key={item.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td className="text-[10px] text-gray-500 font-medium text-center px-2 py-1.5 border-r border-gray-200">{item.coin}</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{Math.round(parseFloat(item.amount||'0'))}u</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{item.holdDays}天</td>
                              <td className="px-2 py-1.5 border-r border-gray-200">
                                <div className="text-right">
                                  <div className="text-[11px] font-bold text-gray-800">{item.totalFee.toFixed(4)}</div>
                                  {prepaidFee > 0 && <div className="text-[9px] text-green-600">已付{prepaidFee.toFixed(4)}</div>}
                                  <div className="text-[9px] text-orange-500">待付{remainingFee.toFixed(4)}</div>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => {
                                    setCollectModal({ order: item, totalFee: item.totalFee, prepaidFee });
                                    setCollectAmount(remainingFee.toFixed(4));
                                    setCollectNote('');
                                  }}
                                  className="bg-orange-500 text-white text-[9px] px-2 py-1 rounded-full font-medium"
                                >收费</button>
                              </td>
                            </tr>
                              );
                          })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td className="text-[10px] text-gray-500 font-semibold px-3 py-1.5 border-t border-gray-200" colSpan={4}>每日合计</td>
                              <td className="text-xs font-bold text-blue-600 text-right px-3 py-1.5 border-t border-gray-200">{person.dailyTotal.toFixed(4)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      )}

      {/* ── 谷底增筹：按币种视图 ── */}
      {mainTab === 'gujian' && feeFilter === 'byCoin' && (
      <div className="px-3 pt-3 pb-10">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : (() => {
          // 按币种聚合（只统计进行中订单）
          type CoinGroup = { coin: string; dailyTotal: number; totalHolding: number; totalQty: number; orderCount: number; userCount: number; orders: ReturnType<typeof calcFeeItem>[] };
          const coinMap = new Map<string, CoinGroup>();
          for (const item of feeItems) {
            if (item.feeType === 'settled') continue;
            const coin = item.coin || 'OTHER';
            if (!coinMap.has(coin)) coinMap.set(coin, { coin, dailyTotal: 0, totalHolding: 0, totalQty: 0, orderCount: 0, userCount: 0, orders: [] });
            const g = coinMap.get(coin)!;
            g.dailyTotal += item.dailyFee;
            g.totalHolding += parseFloat(item.amount || '0');
            g.totalQty += parseFloat((item as any).quantity || '0');
            g.orderCount += 1;
            g.orders.push(item);
          }
          // 每个币种的独立用户数
          Array.from(coinMap.values()).forEach(g => {
            g.userCount = new Set(g.orders.map((o: any) => String(o.userId || o.username))).size;
          });
          const coins = Array.from(coinMap.values()).sort((a, b) => b.dailyTotal - a.dailyTotal);
          if (coins.length === 0) return <div className="text-center py-16 text-gray-400 text-sm">暂无进行中订单</div>;
          // 全局汇总
          const grandDaily = coins.reduce((s, c) => s + c.dailyTotal, 0);
          const grandHolding = coins.reduce((s, c) => s + c.totalHolding, 0);
          return (
            <div className="space-y-2">
              {/* 汇总卡片 */}
              <div className="rounded shadow-sm px-4 py-3 flex gap-3" style={{background:'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)',border:'1px solid #bbf7d0'}}>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">共{coins.length}种币</p>
                  <p className="text-[11px] font-bold text-gray-700 leading-snug">{coins.map(c=>c.coin).join('  ')}</p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">每日合计</p>
                  <p className="text-sm font-bold text-blue-600">{grandDaily.toFixed(2)} <span className="text-[10px] font-normal text-gray-400">U/天</span></p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">持仓总金额</p>
                  <p className="text-sm font-bold text-emerald-600">{Math.round(grandHolding)} <span className="text-[10px] font-normal text-gray-400">U</span></p>
                </div>
              </div>
              {coins.map(cg => {
                const isOpen = expandedCoins.has(cg.coin);
                return (
                  <div key={cg.coin} className="bg-white rounded shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleCoin(cg.coin)}
                      className="w-full px-4 py-3 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800">{cg.coin}</span>
                          <span className="text-xs text-gray-400">{cg.orderCount}单 / {cg.userCount}人</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-blue-600">{cg.dailyTotal.toFixed(2)}</span>
                          <span className="text-[10px] text-gray-400">U/天</span>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">持仓金额 <span className="text-orange-500 font-semibold">{Math.round(cg.totalHolding)}</span> u</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">持币量 <span className="text-purple-500 font-semibold">{formatQty(cg.totalQty)}</span></span>
                      </div>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">月化 <span className="text-blue-500 font-semibold">{Math.round(cg.dailyTotal*30)}</span> u</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">季化 <span className="text-purple-500 font-semibold">{Math.round(cg.dailyTotal*90)}</span> u</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">年化 <span className="text-emerald-500 font-semibold">{Math.round(cg.dailyTotal*365)}</span> u</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100">
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-[9px] font-normal text-gray-400 text-left px-3 py-1 border-r border-b border-gray-200">用户</th>
                              <th className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-10">尾号</th>
                              <th className="text-[9px] font-normal text-gray-400 text-center px-2 py-1 border-r border-b border-gray-200 w-10">档位</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-14">持币量</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-16">持仓金额</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-2 py-1 border-r border-b border-gray-200 w-14">持仓天</th>
                              <th className="text-[9px] font-normal text-gray-400 text-right px-3 py-1 border-b border-gray-200 w-18">日费用</th>
                            </tr>
                          </thead>
                          <tbody>
                          {cg.orders.sort((a,b) => b.dailyFee - a.dailyFee).map((item, idx) => (
                            <tr key={item.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td className="text-[11px] font-medium text-gray-700 truncate px-3 py-1.5 border-r border-gray-200 max-w-0" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {item.nickname || item.username}
                                {item.username && item.username !== item.nickname && <span className="text-[9px] text-gray-400 ml-1">@{item.username}</span>}
                              </td>
                              <td className="text-[10px] text-gray-400 text-center px-2 py-1.5 border-r border-gray-200 font-mono">{String(item.id).padStart(4,'0').slice(-4)}</td>
                              <td className="text-[10px] text-center px-2 py-1.5 border-r border-gray-200 font-semibold" style={{ color: (item as any).tierMode === 'linear' ? '#3B82F6' : '#0d9488' }}>{(item as any).tierMode === 'linear' ? 'L' : `D${item.equityTier}`}</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{formatQty((item as any).quantity||'0')}</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{Math.round(parseFloat(item.amount||'0'))}u</td>
                              <td className="text-[10px] text-gray-400 text-right px-2 py-1.5 border-r border-gray-200">{item.holdDays}天</td>
                              <td className="text-[11px] font-bold text-gray-800 text-right px-3 py-1.5">{item.dailyFee.toFixed(2)}</td>
                            </tr>
                          ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td className="text-[10px] text-gray-500 font-semibold px-3 py-1.5 border-t border-gray-200" colSpan={2}>合计</td>
                              <td className="text-[10px] text-gray-500 px-2 py-1.5 border-t border-gray-200"></td>
                              <td className="text-[10px] font-bold text-purple-600 text-right px-2 py-1.5 border-t border-gray-200">{formatQty(cg.totalQty)}</td>
                              <td className="text-[10px] font-bold text-orange-500 text-right px-2 py-1.5 border-t border-gray-200">{Math.round(cg.totalHolding)}u</td>
                              <td className="text-[10px] text-gray-500 px-2 py-1.5 border-t border-gray-200"></td>
                              <td className="text-xs font-bold text-blue-600 text-right px-3 py-1.5 border-t border-gray-200">{cg.dailyTotal.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      )}

      {/* ── 谷底增筹：用户列表（表格） ── */}
      {mainTab === 'gujian' && feeFilter !== 'byDate' && feeFilter !== 'byPerson' && feeFilter !== 'byCoin' && (
      <div className="px-3 pt-3">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无记录</div>
        ) : (() => {
          // 平铺所有订单（保留用户分组排序：按用户总费高→低，组内按单笔费用高→低）
          let allRows: any[] = [];
          filteredGroups.forEach(group => {
            const sorted = [...group.orders].sort((a, b) => b.totalFee - a.totalFee);
            sorted.forEach((o, i) => allRows.push({ ...o, _nickname: group.nickname, _username: group.username, _isFirstOfUser: i === 0, _userOrderCount: sorted.length }));
          });
          // 点表头后：按选中字段对全部订单排序（打破用户分组）
          if (sortKey) {
            allRows = [...allRows].sort((a, b) => {
              const av = a[sortKey] || 0;
              const bv = b[sortKey] || 0;
              return sortAsc ? av - bv : bv - av;
            });
          }
          const ongoingRows = allRows.filter(r => r.feeType !== 'settled');
          const settledRows = allRows.filter(r => r.feeType === 'settled');
          const renderTable = (rows: any[], title: string) => {
            if (rows.length === 0) return null;
            return (
            <div className="bg-white rounded shadow-sm overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">{title}（{rows.length}）</div>
              <div className="overflow-x-auto">
                <table className="border-collapse text-xs" style={{ width: 'auto', tableLayout: 'auto' }}>
                  <thead>
                    <tr style={{ background: '#f8faff' }} className="text-gray-500">
                      <th className="sticky left-0 z-10 px-1.5 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap" style={{ background: '#f8faff', width: 32, minWidth: 32, maxWidth: 32 }}>用户</th>
                      <th className="px-2 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap" style={{ minWidth: 110 }}>订单</th>
                      <th className="px-1 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap" style={{ width: 28, minWidth: 28, maxWidth: 28 }}>币</th>
                      <th onClick={() => toggleSort('holdDays')} className="px-1.5 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none">天数</th>
                      <th onClick={() => toggleSort('totalFee')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none">费用(U)</th>
                      <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">12%</th>
                      <th onClick={() => toggleSort('nominalApr')} className="px-1.5 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none">名义</th>
                      <th onClick={() => toggleSort('actualApr')} className="px-1.5 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none">实际</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item: any) => (
                      <tr key={item.id} className={item.feeType === 'settled' ? 'bg-gray-100' : 'bg-white'}>
                        <td className="sticky left-0 z-10 px-1 py-2 border border-gray-200" style={{ width: 32, minWidth: 32, maxWidth: 32, background: item.feeType === 'settled' ? '#f3f4f6' : '#fff' }}>
                          <span className="text-gray-800 font-medium text-[11px] leading-tight block break-all" title={item._nickname}>{item._nickname}</span>
                        </td>
                        <td className="px-2 py-2 border border-gray-200">
                          <button type="button" onClick={() => setDetailOrder(item)} className="font-mono text-blue-600 underline decoration-dotted underline-offset-2">AF…{item.orderNo.slice(-4)}</button>
                          {item.isGift && <span className="ml-1 text-[10px]" style={{ color: '#f59e0b' }}>赠</span>}
                          {item.feeType === 'settled' ? (
                            <span title="已结清" className="ml-1.5 inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#ef4444' }} />
                          ) : item.sellStatus === 'selling' ? (
                            <span title="委卖中" className="ml-1.5 inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#f59e0b' }} />
                          ) : (
                            <span title="进行中" className="ml-1.5 inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#22c55e' }} />
                          )}
                          <span className="block text-[10px] text-gray-400 mt-0.5">{Math.round(parseFloat(item.amount || '0'))} U · <span className="font-semibold" style={{ color: (item as any).tierMode === 'linear' ? '#3B82F6' : '#0d9488' }}>{(item as any).tierMode === 'linear' ? 'L' : `D${item.equityTier}`}</span></span>
                        </td>
                        <td className="px-1 py-2 text-center border border-gray-200 whitespace-nowrap" style={{ width: 28, minWidth: 28, maxWidth: 28 }}>
                          {(() => {
                            const C: Record<string, { s: string; c: string }> = {
                              BTC: { s: 'B', c: '#f59e0b' },
                              ETH: { s: 'E', c: '#3b82f6' },
                              SOL: { s: 'S', c: '#a855f7' },
                            };
                            const cfg = C[item.coin];
                            return cfg
                              ? <span className="font-bold" style={{ color: cfg.c }}>{cfg.s}</span>
                              : <span className="text-gray-700">{item.coin || '-'}</span>;
                          })()}
                        </td>
                        <td className="px-1.5 py-2 text-right border border-gray-200 whitespace-nowrap text-gray-600">{item.holdDays}</td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">
                          <span className="block font-bold text-gray-900">{item.totalFee.toFixed(2)}</span>
                          <span className="block text-[10px] text-gray-400">{item.dailyFee.toFixed(2)}/天</span>
                        </td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">
                          {item.holdDays > 30 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <>
                              <span className="block font-bold text-gray-900">{item.totalFee12.toFixed(2)}</span>
                              <span className="block text-[10px] text-gray-400">{item.dailyFee12.toFixed(2)}/天</span>
                            </>
                          )}
                        </td>
                        <td className="px-1.5 py-2 text-right border border-gray-200 whitespace-nowrap">
                          {item.feeType === 'settled' ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAprInfo(item)}
                              className="font-bold underline decoration-dotted underline-offset-2"
                              style={{ color: '#2563eb' }}
                            >
                              {Math.round(item.nominalApr * 100)}%
                            </button>
                          )}
                        </td>
                        <td className="px-1.5 py-2 text-right border border-gray-200 whitespace-nowrap">
                          {item.feeType === 'settled' ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAprInfo(item)}
                              className="font-bold underline decoration-dotted underline-offset-2"
                              style={{ color: (() => {
                                // 实际=名义 同色；实际越高于名义颜色越深（按倍率分档）
                                const ratio = item.nominalApr > 0 ? item.actualApr / item.nominalApr : 1;
                                if (ratio <= 1.05) return '#2563eb';      // 与名义相同
                                if (ratio <= 1.5) return '#1e40af';       // 稍深
                                if (ratio <= 2.2) return '#1e3a8a';       // 更深
                                if (ratio <= 3.5) return '#172554';       // 很深
                                return '#0f172a';                          // 最深
                              })() }}
                            >
                              {Math.round(item.actualApr * 100)}%
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* 汇总行 */}
                    {(() => {
                      const sumAmount = rows.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
                      const sumDaily = rows.reduce((s, r) => s + (r.dailyFee || 0), 0);
                      const sumFee = rows.reduce((s, r) => s + (r.totalFee || 0), 0);
                      const sumDaily12 = rows.reduce((s, r) => s + (r.holdDays > 30 ? 0 : (r.dailyFee12 || 0)), 0);
                      const sumFee12 = rows.reduce((s, r) => s + (r.holdDays > 30 ? 0 : (r.totalFee12 || 0)), 0);
                      return (
                        <tr style={{ background: '#f8faff' }} className="font-semibold text-gray-700">
                          <td className="sticky left-0 z-10 px-1 py-2 border border-gray-200 text-[11px]" style={{ background: '#f8faff', width: 32, minWidth: 32, maxWidth: 32 }}>合计</td>
                          <td className="px-2 py-2 border border-gray-200">
                            <span className="block text-[10px] text-gray-600">{Math.round(sumAmount)} U</span>
                          </td>
                          <td className="px-1 py-2 border border-gray-200" />
                          <td className="px-1.5 py-2 border border-gray-200" />
                          <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">
                            <span className="block font-bold text-gray-900">{sumFee.toFixed(2)}</span>
                            <span className="block text-[10px] text-gray-600">{sumDaily.toFixed(2)}/天</span>
                          </td>
                          <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">
                            <span className="block font-bold text-gray-900">{sumFee12.toFixed(2)}</span>
                            <span className="block text-[10px] text-gray-600">{sumDaily12.toFixed(2)}/天</span>
                          </td>
                          <td className="px-1.5 py-2 border border-gray-200" />
                          <td className="px-1.5 py-2 border border-gray-200" />
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            );
          };
          return (
            <div className="space-y-4">
              {renderTable(ongoingRows, '进行中 / 委卖中')}
              {renderTable(settledRows, '已结清')}
            </div>
          );
        })()}
      </div>
      )}

      {/* ── 融资付息：临时基础表格 ── */}
      {mainTab === 'finance' && (
      <div className="px-3 pt-3">
        {financeLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : financeOrders.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无融资付息订单</div>
        ) : (() => {
          const statusMap: Record<string, string> = { active: '进行中', settled: '已结清', completed: '已结清', cancelled: '已取消' };
          const isFinSettled = (o: any) => o.status === 'settled' || o.status === 'completed';
          // 只显示进行中的订单，已结清完全排除
          const onlyOngoing = financeOrders.filter((o: any) => !isFinSettled(o));
          const dirFiltered = onlyOngoing.filter((o: any) => {
            if (finDirectionFilter === 'collect') return isCollect(o);
            if (finDirectionFilter === 'pay') return !isCollect(o);
            return true;
          });
          // 搜索过滤
          const kw = finSearch.trim().toLowerCase();
          const finFiltered = kw ? dirFiltered.filter((o: any) => {
            const user = (o.username || o.userName || '').toLowerCase();
            const orderNo = (o.order_no || '').toLowerCase();
            const start = (o.interest_start_date || o.buy_date || '').toLowerCase();
            const coin = (o.coin || '').toLowerCase();
            return user.includes(kw) || orderNo.includes(kw) || start.includes(kw) || coin.includes(kw);
          }) : dirFiltered;
          const finOngoing = finFiltered.filter((o: any) => !isFinSettled(o));
          const finSettled = finFiltered.filter((o: any) => isFinSettled(o));
          // 收息汇总（我方出借）
          const collectTotal = finFiltered.filter((o: any) => o.principal_lent_out == 1).reduce((s: number, o: any) => {
            const b = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
            const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
            const st = o.interest_start_date || o.buy_date || '';
            if (!b || r == null || !st) return s;
            const sd = new Date(st); if (isNaN(sd.getTime())) return s;
            const startDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
            const todayDay = new Date(); todayDay.setHours(0,0,0,0);
            const d = Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / 86400000) + 1);
            return s + b * (r / 100) / 365 * d;
          }, 0);
          // 付息汇总（我方借入）
          const payTotal = finFiltered.filter((o: any) => o.principal_lent_out != 1).reduce((s: number, o: any) => {
            const b = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
            const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
            const st = o.interest_start_date || o.buy_date || '';
            if (!b || r == null || !st) return s;
            const sd = new Date(st); if (isNaN(sd.getTime())) return s;
            const startDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
            const todayDay = new Date(); todayDay.setHours(0,0,0,0);
            const d = Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / 86400000) + 1);
            return s + b * (r / 100) / 365 * d;
          }, 0);
          // 日息计算（只统计进行中订单）
          const collectOngoing = finOngoing.filter((o: any) => isCollect(o));
          const payOngoing = finOngoing.filter((o: any) => !isCollect(o));
          const getBase2 = (o: any) => {
            const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
            if ((o.coin || '').toUpperCase() === 'CNY') return raw / cnyRate;
            return raw;
          };
          const collectDailySum = collectOngoing.reduce((s: number, o: any) => {
            const b = getBase2(o);
            const r = o.interest_rate_annual != null ? Math.abs(Number(o.interest_rate_annual)) : 0;
            return s + b * (r / 100) / 365;
          }, 0);
          const payDailySum = payOngoing.reduce((s: number, o: any) => {
            const b = getBase2(o);
            const r = o.interest_rate_annual != null ? Math.abs(Number(o.interest_rate_annual)) : 0;
            return s + b * (r / 100) / 365;
          }, 0);
          const renderFinTable = (rows: any[], title: string) => {
            if (rows.length === 0) return null;
            // 排序处理
            const sortedRows = [...rows].sort((a, b) => {
              if (!finSortKey) return 0;
              let av: any, bv: any;
              const getBase = (o: any) => o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
              const getStart = (o: any) => o.interest_start_date || o.buy_date || '';
              const getDays = (o: any) => {
                const st = getStart(o);
                if (!st) return 0;
                const sd = new Date(st);
                if (isNaN(sd.getTime())) return 0;
                const startDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                const now = new Date();
                const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              };
              const getAccrued = (o: any) => {
                const b = getBase(o); const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                const d = getDays(o);
                return (b && r != null && d) ? b * (r / 100) / 365 * d : 0;
              };
              if (finSortKey === 'username') { av = (a.username || a.userName || '').toLowerCase(); bv = (b.username || b.userName || '').toLowerCase(); }
              else if (finSortKey === 'start') { av = getStart(a); bv = getStart(b); }
              else if (finSortKey === 'coin') { av = (a.coin || '').toUpperCase(); bv = (b.coin || '').toUpperCase(); }
              else if (finSortKey === 'days') { av = getDays(a); bv = getDays(b); }
              else if (finSortKey === 'base') { av = getBase(a); bv = getBase(b); }
              else if (finSortKey === 'rate') { av = a.interest_rate_annual != null ? Number(a.interest_rate_annual) : 0; bv = b.interest_rate_annual != null ? Number(b.interest_rate_annual) : 0; }
              else if (finSortKey === 'accrued') { av = getAccrued(a); bv = getAccrued(b); }
              else if (finSortKey === 'paid') { av = finPaidMap[Number(a.id)] != null ? Number(finPaidMap[Number(a.id)]) : 0; bv = finPaidMap[Number(b.id)] != null ? Number(finPaidMap[Number(b.id)]) : 0; }
              else if (finSortKey === 'order_no') { av = (a.order_no || '').toLowerCase(); bv = (b.order_no || '').toLowerCase(); }
              else if (finSortKey === 'daily' || finSortKey === 'monthly') {
                const getDaily = (o: any) => { const b2 = getBase(o); const r2 = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null; return (b2 && r2 != null) ? Math.abs(b2 * (r2 / 100) / 365) : 0; };
                av = getDaily(a) * (finSortKey === 'monthly' ? 30 : 1);
                bv = getDaily(b) * (finSortKey === 'monthly' ? 30 : 1);
              }
              else if (finSortKey === 'status') { av = (a.status || ''); bv = (b.status || ''); }
              else return 0;
              if (av < bv) return finSortAsc ? -1 : 1;
              if (av > bv) return finSortAsc ? 1 : -1;
              return 0;
            });
            const baseSum = rows.reduce((s, o) => {
              const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
              const b = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
              return s + b;
            }, 0);
            const dailySum = rows.reduce((s, o) => {
              const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
              const b = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
              const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
              return (b && r != null) ? s + Math.abs(b * (r / 100) / 365) : s;
            }, 0);
            const monthlySum = dailySum * 30;
            const accruedSum = rows.reduce((s, o) => {
              const b = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
              const r = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
              const st = o.interest_start_date || o.buy_date || '';
              if (!b || r == null || !st) return s;
              const sd = new Date(st);
              if (isNaN(sd.getTime())) return s;
              const startDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
              const now = new Date();
              const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const d = Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              return s + b * (r / 100) / 365 * d;
            }, 0);
            const paidSum = rows.reduce((s, o) => s + (finPaidMap[Number(o.id)] != null ? Number(finPaidMap[Number(o.id)]) : 0), 0);
            return (
              <div className="bg-white rounded shadow-sm overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">{title}（{rows.length}）</div>
                <div className="overflow-x-auto">
                  <table className="border-collapse text-xs" style={{ width: 'auto', tableLayout: 'auto' }}>
                    <thead>
                      <tr style={{ background: '#f8faff' }} className="text-gray-500">
                        <th onClick={() => toggleFinSort('username')} className="px-2 py-2 text-left font-semibold border border-gray-200 cursor-pointer select-none" style={{ width: '4em', minWidth: '4em', maxWidth: '4em', color: finSortKey === 'username' ? '#2563eb' : undefined }}>用户</th>
                        <th onClick={() => toggleFinSort('coin')} className="px-2 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'coin' ? '#2563eb' : undefined }}>币</th>
                        <th onClick={() => toggleFinSort('days')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'days' ? '#2563eb' : undefined }}>天数</th>
                        <th onClick={() => toggleFinSort('order_no')} className="px-2 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'order_no' ? '#2563eb' : undefined }}>订单</th>
                        <th onClick={() => toggleFinSort('base')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'base' ? '#2563eb' : undefined }}>计息本金</th>
                        <th onClick={() => toggleFinSort('rate')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'rate' ? '#2563eb' : undefined }}>年利率</th>
                        <th onClick={() => toggleFinSort('daily')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'daily' ? '#2563eb' : undefined }}>日息</th>
                        <th onClick={() => toggleFinSort('monthly')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'monthly' ? '#2563eb' : undefined }}>月息</th>
                        <th onClick={() => toggleFinSort('accrued')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'accrued' ? '#2563eb' : undefined }}>待付利息</th>
                        <th onClick={() => toggleFinSort('paid')} className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'paid' ? '#2563eb' : undefined }}>已付利息</th>
                        <th onClick={() => toggleFinSort('status')} className="px-2 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap cursor-pointer select-none" style={{ color: finSortKey === 'status' ? '#2563eb' : undefined }}>状态</th>
                        <th className="px-2 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((o: any, i: number) => {
                        const baseRaw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                        // CNY 订单按实时汇率折算成 USDT
                        const isCNY = o.coin === 'CNY';
                        const base = isCNY ? baseRaw / cnyRate : baseRaw;
                        const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                        const start = o.interest_start_date || o.buy_date || '';
                        // 距今天数：起息日当天算第1天
                        let elapsedDays: number | null = null;
                        if (start) {
                          const sd = new Date(start);
                          if (!isNaN(sd.getTime())) {
                            const startDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                            const now = new Date();
                            const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            elapsedDays = Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                          }
                        }
                        const orderNoRaw = String(o.order_no || '');
                        const orderNoShort = orderNoRaw ? 'AF…' + orderNoRaw.slice(-4) : '-';
                        // 待付利息：计息本金 × 年利率% ÷ 365 × 天数（与订单详情口径一致，按累计定格显示）
                        const accrued = (base && rate != null && elapsedDays != null)
                          ? base * (rate / 100) / 365 * elapsedDays
                          : null;
                        const paid = finPaidMap[Number(o.id)] != null ? Number(finPaidMap[Number(o.id)]) : 0;
                        return (
                          <tr key={o.id ?? i} className="text-gray-700">
                            <td className="px-2 py-2 border border-gray-100 overflow-hidden" style={{ width: '4em', minWidth: '4em', maxWidth: '4em' }}>
                              <div className="overflow-hidden" style={{ width: '4em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{o.username || o.userName || '-'}</div>
                            </td>
                            <td className="px-2 py-2 text-center border border-gray-100 whitespace-nowrap">
                              {(() => {
                                const C: Record<string, { s: string; c: string }> = {
                                  BTC: { s: 'B', c: '#f59e0b' },
                                  ETH: { s: 'E', c: '#3b82f6' },
                                  SOL: { s: 'S', c: '#a855f7' },
                                };
                                const cfg = C[o.coin];
                                return cfg
                                  ? <span className="font-bold" style={{ color: cfg.c }}>{cfg.s}</span>
                                  : <span className="text-gray-700">{o.coin || '-'}</span>;
                              })()}
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">
                              {elapsedDays != null ? (
                                <button
                                  type="button"
                                  ref={finDaysTooltip?.orderId === o.id ? (el => { if (el) (finDaysTriggerRef as any).current = el; }) : undefined}
                                  onClick={e => {
                                    (finDaysTriggerRef as any).current = e.currentTarget;
                                    setFinDaysTooltip(finDaysTooltip?.orderId === o.id ? null : { orderId: o.id, start, days: elapsedDays });
                                  }}
                                  className="underline decoration-dotted underline-offset-2 font-medium"
                                  style={{ color: '#374151' }}
                                >{elapsedDays}</button>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-2 border border-gray-100 whitespace-nowrap">
                              <button type="button" onClick={() => setFinDetailOrder({ ...o, _elapsedDays: elapsedDays })} className="font-mono underline decoration-dotted underline-offset-2" style={{ color: '#2563eb' }}>{orderNoShort}</button>
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">
                              {base ? (
                                isCNY ? (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      (finBaseTriggerRef as any).current = e.currentTarget;
                                      setFinBaseTooltip(finBaseTooltip?.orderId === o.id ? null : { orderId: o.id, coin: o.coin, baseRaw, baseU: base, rate: cnyRate });
                                    }}
                                    className="underline decoration-dotted underline-offset-2"
                                    style={{ color: '#374151' }}
                                  >{base.toFixed(2)}</button>
                                ) : <span>{base.toFixed(2)}</span>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">{rate != null ? rate + '%' : '-'}</td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap" style={{ color: '#6b7280' }}>
                              {(base && rate != null) ? (Math.abs(base * (rate / 100) / 365)).toFixed(2) : '-'}
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap" style={{ color: '#6b7280' }}>
                              {(base && rate != null) ? (Math.abs(base * (rate / 100) / 365) * 30).toFixed(0) : '-'}
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap" style={{ color: '#2563eb' }}>{accrued != null ? accrued.toFixed(2) : '-'}</td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setFinPaidDetailOrderId(Number(o.id))}
                                className="font-medium underline decoration-dotted underline-offset-2"
                                style={{ color: '#16a34a' }}
                              >{paid.toFixed(2)}</button>
                            </td>
                            <td className="px-2 py-2 text-center border border-gray-100 whitespace-nowrap">{statusMap[o.status] || o.status || '-'}</td>
                            <td className="px-2 py-2 text-center border border-gray-100 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => { setFinChargeModal({ order: o }); setFinChargeAmount(''); setFinChargeDate(new Date().toISOString().slice(0, 10)); setFinChargeNote(''); }}
                                className="text-xs px-2 py-1 rounded-full font-medium"
                                style={{ backgroundColor: '#EEF4FF', color: '#1A56DB' }}
                              >收费</button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#f8faff' }} className="font-semibold text-gray-700">
                        <td className="px-2 py-2 border border-gray-200 whitespace-nowrap">合计</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">{baseSum.toFixed(2)}</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#6b7280' }}>{dailySum.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#6b7280' }}>{monthlySum.toFixed(0)}</td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#2563eb' }}>{accruedSum.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#16a34a' }}>{paidSum.toFixed(2)}</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          };
          // 天数Tooltip内容生成
          const daysTooltipContent = finDaysTooltip ? (() => {
            const s = finDaysTooltip.start ? finDaysTooltip.start.slice(0, 10) : null;
            const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}.${String(t.getMonth()+1).padStart(2,'0')}.${String(t.getDate()).padStart(2,'0')}`; })();
            const startStr = s ? (() => { const p = s.split('-'); return p.length===3 ? `${p[0]}.${p[1]}.${p[2]}` : s; })() : '-';
            return (
              <div className="text-xs text-gray-700 flex items-center gap-1 pr-4 whitespace-nowrap">
                <span className="text-gray-400">起息日</span>
                <span className="font-medium">{startStr}</span>
                <span className="text-gray-300 mx-0.5">→</span>
                <span className="text-gray-400">今天</span>
                <span className="font-medium">{todayStr}</span>
                <span className="text-gray-300 mx-0.5">，共</span>
                <span className="font-bold text-blue-600">{finDaysTooltip.days}天</span>
              </div>
            );
          })() : null;

          // 计息本金折算Tooltip内容
          const baseTooltipContent = finBaseTooltip ? (
            <div className="text-xs text-gray-700 flex items-center gap-1 pr-4 whitespace-nowrap">
              <span className="font-medium">{finBaseTooltip.baseRaw.toLocaleString()}</span>
              <span className="text-gray-400">{finBaseTooltip.coin}</span>
              <span className="text-gray-300 mx-0.5">÷</span>
              <span className="text-gray-400">汇率</span>
              <span className="font-medium">{finBaseTooltip.rate.toFixed(4)}</span>
              <span className="text-gray-300 mx-0.5">=</span>
              <span className="font-bold text-blue-600">{finBaseTooltip.baseU.toFixed(2)} U</span>
            </div>
          ) : null;

          return (
            <div className="space-y-3">
              {/* 天数Tooltip */}
              {finDaysTooltip && daysTooltipContent && (
                <Tooltip
                  content={daysTooltipContent}
                  isOpen={true}
                  onClose={() => setFinDaysTooltip(null)}
                  triggerRef={finDaysTriggerRef as any}
                />
              )}
              {/* 计息本金折算Tooltip */}
              {finBaseTooltip && baseTooltipContent && (
                <Tooltip
                  content={baseTooltipContent}
                  isOpen={true}
                  onClose={() => setFinBaseTooltip(null)}
                  triggerRef={finBaseTriggerRef as any}
                />
              )}
              {/* 搜索框 */}
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm border border-gray-100">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                <input
                  type="text"
                  value={finSearch}
                  onChange={e => setFinSearch(e.target.value)}
                  placeholder="搜索用户名、订单号、起息日、币种…"
                  className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
                />
                {finSearch && (
                  <button type="button" onClick={() => setFinSearch('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              {/* 收/付方向筛选 + 汇总卡片 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* 按钮行 */}
                <div className="flex gap-2 px-3 pt-3 pb-2">
                  {([
                    { key: 'all' as const, label: `全部 ${financeOrders.filter((o: any) => !isFinSettled(o)).length}单` },
                    { key: 'collect' as const, label: `我方收息 ${financeOrders.filter((o: any) => isCollect(o) && !isFinSettled(o)).length}单` },
                    { key: 'pay' as const, label: `我方付息 ${financeOrders.filter((o: any) => !isCollect(o) && !isFinSettled(o)).length}单` },
                  ]).map(t => (
                    <button key={t.key} onClick={() => setFinDirectionFilter(t.key)}
                      className="flex-1 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={finDirectionFilter === t.key
                        ? { background: '#2563eb', color: '#fff' }
                        : { background: '#eff2f9', color: '#6b7280' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* 汇总小卡片：收息 vs 付息（全部时隐藏） */}
                {finDirectionFilter !== 'all' && (
                  <div className="border-t border-gray-50 px-3 py-2 text-center">
                    {finDirectionFilter === 'collect' && (
                      <>
                        <div className="flex justify-between px-4">
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">日</span><span style={{ color: '#16a34a', fontSize: '1.1rem' }} className="font-bold">+{collectDailySum.toFixed(1)}</span></span>
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">月</span><span style={{ color: '#16a34a', fontSize: '1.1rem' }} className="font-bold">+{(collectDailySum * 30).toFixed(0)}</span></span>
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">年</span><span style={{ color: '#16a34a', fontSize: '1.1rem' }} className="font-bold">+{(collectDailySum * 365).toFixed(0)}</span></span>
                        </div>
                      </>
                    )}
                    {finDirectionFilter === 'pay' && (
                      <>
                        <div className="flex justify-between px-4">
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">日</span><span style={{ color: '#dc2626', fontSize: '1.1rem' }} className="font-bold">-{payDailySum.toFixed(1)}</span></span>
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">月</span><span style={{ color: '#dc2626', fontSize: '1.1rem' }} className="font-bold">-{(payDailySum * 30).toFixed(0)}</span></span>
                          <span className="flex flex-col items-center gap-0.5"><span className="text-xs text-gray-400">年</span><span style={{ color: '#dc2626', fontSize: '1.1rem' }} className="font-bold">-{(payDailySum * 365).toFixed(0)}</span></span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 分组筛选按钮 */}
              <div className="flex gap-2">
                {([
                  { key: 'list' as const, label: '列表' },
                  { key: 'byDate' as const, label: '按日期' },
                  { key: 'byPerson' as const, label: '按人员' },
                  { key: 'byCoin' as const, label: '按币种' },
                ]).map(t => (
                  <button key={t.key} onClick={() => setFinGroupFilter(t.key)}
                    className="flex-1 py-2 rounded-full text-sm font-medium transition-all"
                    style={finGroupFilter === t.key
                      ? { background: '#2563eb', color: '#fff' }
                      : { background: '#eff2f9', color: '#6b7280' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {kw && finOngoing.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">未找到匹配「{finSearch}」的订单</div>
              )}

              {/* 列表视图 */}
              {finGroupFilter === 'list' && (
                <>
                  {renderFinTable(finOngoing.filter((o: any) => isCollect(o)), '进行中 · 收息')}
                  {renderFinTable(finOngoing.filter((o: any) => !isCollect(o)), '进行中 · 付息')}
                </>
              )}

              {/* 按日期视图 */}
              {finGroupFilter === 'byDate' && (() => {
                const calcDaily = (o: any) => {
                  const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                  const base2 = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
                  const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                  if (!base2 || rate == null) return 0;
                  return base2 * (Math.abs(rate) / 100) / 365;
                };
                const dateMap = new Map<string, any[]>();
                for (const o of finFiltered) {
                  const st = o.interest_start_date || o.buy_date || '';
                  const key = st ? st.slice(0, 10) : '日期未知';
                  if (!dateMap.has(key)) dateMap.set(key, []);
                  dateMap.get(key)!.push(o);
                }
                const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
                if (sortedDates.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">暂无记录</div>;
                return (
                  <div className="space-y-2">
                    {sortedDates.map(dk => {
                      const items = dateMap.get(dk)!;
                      const isOpen = expandedDates.has('fin_' + dk);
                      // 收起行：按日期分组的日息合计（收息日息 / 付息日息）
                      const collectDaily = items.filter((o: any) => isCollect(o)).reduce((s: number, o: any) => s + calcDaily(o), 0);
                      const payDaily = items.filter((o: any) => !isCollect(o)).reduce((s: number, o: any) => s + calcDaily(o), 0);
                      const parts = dk.split('-');
                      const shortDate = parts.length === 3 ? `${parseInt(parts[1])}月${parseInt(parts[2])}日` : dk;
                      return (
                        <div key={dk} className="bg-white rounded shadow-sm overflow-hidden">
                          <button onClick={() => toggleDate('fin_' + dk)} className="w-full flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-800">{shortDate}</span>
                              <span className="text-xs text-gray-400">{items.length}单</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {collectDaily > 0 && <span className="text-sm font-bold" style={{ color: '#16a34a' }}>+{collectDaily.toFixed(2)}/天</span>}
                              {payDaily > 0 && <span className="text-sm font-bold" style={{ color: '#dc2626' }}>-{payDaily.toFixed(2)}/天</span>}
                              {isOpen ? <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100">
                              {items.map((o, i) => {
                                const daily = calcDaily(o);
                                const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                                const base2 = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
                                const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                                const collect = isCollect(o);
                                return (
                                <div key={o.id ?? i} className="px-4 py-2.5 border-b border-gray-50 last:border-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-medium text-gray-800">{o.username || o.userName || '-'}</span>
                                      <span className="text-[10px] font-semibold" style={{ color: o.coin === 'BTC' ? '#f59e0b' : o.coin === 'ETH' ? '#3b82f6' : o.coin === 'SOL' ? '#a855f7' : '#374151' }}>{o.coin || '-'}</span>
                                      {collect
                                        ? <span className="text-[10px] px-1 rounded" style={{ background: '#dcfce7', color: '#16a34a' }}>收息</span>
                                        : <span className="text-[10px] px-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>付息</span>
                                      }
                                    </div>
                                    {/* 日息突出显示 */}
                                    <span className="text-sm font-bold" style={{ color: collect ? '#16a34a' : '#dc2626' }}>
                                      {collect ? '+' : '-'}{daily.toFixed(2)}/天
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-gray-400 font-mono">{o.order_no || `#${o.id}`}</span>
                                    {rate != null && <span className="text-[10px]" style={{ color: '#2563eb' }}>年利率 {rate}%</span>}
                                    <span className="text-[10px] text-gray-400">本金 {base2 > 0 ? base2.toFixed(0) : '-'} U</span>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 按人员视图 */}
              {finGroupFilter === 'byPerson' && (() => {
                const calcDaily2 = (o: any) => {
                  const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                  const base2 = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
                  const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                  if (!base2 || rate == null) return 0;
                  return base2 * (Math.abs(rate) / 100) / 365;
                };
                const personMap = new Map<string, { name: string; orders: any[]; collectDaily: number; payDaily: number }>();
                for (const o of finFiltered) {
                  const uid = String(o.user_id || o.userId || o.username || 'unknown');
                  const name = o.username || o.userName || uid;
                  if (!personMap.has(uid)) personMap.set(uid, { name, orders: [], collectDaily: 0, payDaily: 0 });
                  const p = personMap.get(uid)!;
                  const d = calcDaily2(o);
                  p.orders.push(o);
                  if (isCollect(o)) p.collectDaily += d; else p.payDaily += d;
                }
                const persons = Array.from(personMap.values()).sort((a, b) => (b.collectDaily + b.payDaily) - (a.collectDaily + a.payDaily));
                if (persons.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">暂无记录</div>;
                return (
                  <div className="space-y-2">
                    {persons.map(p => {
                      const isOpen = expandedPersons.has('fin_' + p.name);
                      return (
                        <div key={p.name} className="bg-white rounded shadow-sm overflow-hidden">
                          <button onClick={() => togglePerson('fin_' + p.name)} className="w-full flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-800">{p.name}</span>
                              <span className="text-xs text-gray-400">{p.orders.length}单</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {p.collectDaily > 0 && <span className="text-sm font-bold" style={{ color: '#16a34a' }}>+{p.collectDaily.toFixed(2)}/天</span>}
                              {p.payDaily > 0 && <span className="text-sm font-bold" style={{ color: '#dc2626' }}>-{p.payDaily.toFixed(2)}/天</span>}
                              {isOpen ? <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100">
                              {p.orders.map((o, i) => {
                                const raw = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                                const base2 = (o.coin || '').toUpperCase() === 'CNY' ? raw / cnyRate : raw;
                                const rate = o.interest_rate_annual != null ? Number(o.interest_rate_annual) : null;
                                const st = o.interest_start_date || o.buy_date || '';
                                const stShort = st ? (() => { const p2 = st.slice(0,10).split('-'); return p2.length===3 ? `${parseInt(p2[1])}/${parseInt(p2[2])}` : st.slice(5,10); })() : '-';
                                const daily = calcDaily2(o);
                                const collect = isCollect(o);
                                return (
                                <div key={o.id ?? i} className="px-4 py-2.5 border-b border-gray-50 last:border-0">
                                  {/* 第一行：订单号 + 币种 + 收付标签 + 日息（突出） */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-gray-400 font-mono">{o.order_no || `#${o.id}`}</span>
                                      <span className="text-[10px] font-semibold" style={{ color: o.coin === 'BTC' ? '#f59e0b' : o.coin === 'ETH' ? '#3b82f6' : o.coin === 'SOL' ? '#a855f7' : '#374151' }}>{o.coin || '-'}</span>
                                      {collect
                                        ? <span className="text-[10px] px-1 rounded" style={{ background: '#dcfce7', color: '#16a34a' }}>收息</span>
                                        : <span className="text-[10px] px-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>付息</span>
                                      }
                                    </div>
                                    {/* 日息突出显示 */}
                                    <span className="text-sm font-bold" style={{ color: collect ? '#16a34a' : '#dc2626' }}>
                                      {collect ? '+' : '-'}{daily.toFixed(2)}/天
                                    </span>
                                  </div>
                                  {/* 第二行：起息日 + 年利率 + 本金 */}
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-gray-400">起息 {stShort}</span>
                                    {rate != null && <span className="text-[10px]" style={{ color: '#2563eb' }}>年利率 {rate}%</span>}
                                    <span className="text-[10px] text-gray-400">本金 {base2 > 0 ? base2.toFixed(0) : '-'} U</span>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 按币种视图 */}
              {finGroupFilter === 'byCoin' && (() => {
                const coinMap = new Map<string, { orders: any[]; totalBase: number; collectBase: number; payBase: number }>();
                for (const o of finFiltered) {
                  const coin = o.coin || '未知币种';
                  if (!coinMap.has(coin)) coinMap.set(coin, { orders: [], totalBase: 0, collectBase: 0, payBase: 0 });
                  const c = coinMap.get(coin)!;
                  const b = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
                  c.orders.push(o);
                  c.totalBase += b;
                  if (o.principal_lent_out == 1) c.collectBase += b; else c.payBase += b;
                }
                const coins = Array.from(coinMap.entries()).sort((a, b) => b[1].totalBase - a[1].totalBase);
                if (coins.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">暂无记录</div>;
                const COIN_COLOR: Record<string, string> = { BTC: '#f59e0b', ETH: '#3b82f6', SOL: '#a855f7' };
                return (
                  <div className="space-y-2">
                    {coins.map(([coin, cg]) => {
                      const isOpen = expandedCoins.has('fin_' + coin);
                      return (
                        <div key={coin} className="bg-white rounded shadow-sm overflow-hidden">
                          <button onClick={() => toggleCoin('fin_' + coin)} className="w-full flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold" style={{ color: COIN_COLOR[coin] || '#374151' }}>{coin}</span>
                              <span className="text-xs text-gray-400">{cg.orders.length}单</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {cg.collectBase > 0 && <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>+{cg.collectBase.toFixed(0)}</span>}
                              {cg.payBase > 0 && <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>-{cg.payBase.toFixed(0)}</span>}
                              {isOpen ? <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> : <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100">
                              {cg.orders.map((o, i) => (
                                <div key={o.id ?? i} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0">
                                  <div>
                                    <span className="text-xs font-medium text-gray-700">{o.username || o.userName || '-'}</span>
                                    <span className="ml-2 text-[10px] text-gray-400">{o.interest_start_date || o.buy_date || '-'}</span>
                                    {o.principal_lent_out == 1
                                      ? <span className="ml-1 text-[10px] px-1 rounded" style={{ background: '#dcfce7', color: '#16a34a' }}>收息</span>
                                      : <span className="ml-1 text-[10px] px-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>付息</span>
                                    }
                                  </div>
                                  <span className="text-xs font-bold text-gray-700">{o.interest_base != null ? Number(o.interest_base).toFixed(0) : (o.amount != null ? Number(o.amount).toFixed(0) : '-')} U</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
      )}

      {/* 已付利息历史记录弹窗 */}
      {finPaidDetailOrderId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setFinPaidDetailOrderId(null)}>
          <div className="bg-white rounded-t-2xl w-full shadow-2xl p-5" style={{ maxWidth: 480, maxHeight: '70vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-gray-800 text-base">结息记录</div>
              <button type="button" onClick={() => setFinPaidDetailOrderId(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {finPaidDetailList.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">暂无结息记录</div>
            ) : (
              <div className="space-y-2">
                {finPaidDetailList.map((p: any) => (
                  <div key={p.id} className="bg-gray-50 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" style={{ color: '#16a34a' }}>+{parseFloat(p.amount).toFixed(2)} U</span>
                      <span className="text-xs text-gray-400">{p.pay_date || p.payment_date || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {(p.operatorName || p.username) && <span className="text-xs text-gray-400">记录人：{p.operatorName || p.username}</span>}
                      {p.note && <span className="text-xs text-gray-300">|</span>}
                      {p.note && <span className="text-xs text-gray-400">{p.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 融资付息收费弹窗 */}
      {finChargeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setFinChargeModal(null)}>
          <div className="bg-white rounded-t-2xl w-full shadow-2xl p-5 space-y-4" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800 text-base">记录结息</div>
                <div className="text-xs text-gray-400 mt-0.5">{finChargeModal.order.username || finChargeModal.order.userName || '-'} · {finChargeModal.order.coin || '-'}</div>
              </div>
              <button type="button" onClick={() => setFinChargeModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息金额 (U)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={finChargeAmount}
                  onChange={e => setFinChargeAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                <input
                  type="date"
                  value={finChargeDate}
                  onChange={e => setFinChargeDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">备注（可选）</label>
              <input
                type="text"
                value={finChargeNote}
                onChange={e => setFinChargeNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="结息说明"
              />
            </div>
            <button
              type="button"
              disabled={addFinPaymentMutation.isPending || !finChargeAmount}
              onClick={() => {
                if (!finChargeAmount) return;
                addFinPaymentMutation.mutate({
                  orderId: finChargeModal.order.id,
                  ledgerId,
                  amount: parseFloat(finChargeAmount),
                  payDate: finChargeDate,
                  note: finChargeNote,
                });
              }}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {addFinPaymentMutation.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        </div>
      )}

      {/* 年化说明弹窗 */}
      {aprInfo && (() => {
        const tradeValue = aprInfo.tradeValue || 0;
        const dailyFee = aprInfo.dailyFee || 0;
        const annualFee = dailyFee * 365;
        const apr = tradeValue > 0 ? (annualFee / tradeValue * 100) : 0;
        const amount = parseFloat(aprInfo.amount || '0');
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setAprInfo(null)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">年化费率说明</h3>
                <button onClick={() => setAprInfo(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                订单 <span className="font-mono">{aprInfo.orderNo}</span>（{aprInfo.coin}）的年化费率计算过程：
              </p>
              <div className="space-y-2 text-xs text-gray-700">
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">下单金额</span>
                  <span className="font-medium">{amount.toFixed(2)} U</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">订单价值{aprInfo.isGift ? '（赠单）' : '（×5.25）'}</span>
                  <span className="font-medium">{tradeValue.toFixed(2)} U</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">日费率 = 订单价值 ÷ 0.75 × 0.12 ÷ 365</span>
                  <span className="font-medium">{dailyFee.toFixed(4)} U</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">年化费用 = 日费率 × 365</span>
                  <span className="font-medium">{annualFee.toFixed(2)} U</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">名义年化费率 = 年化费用 ÷ 订单价值</span>
                  <span className="font-bold text-blue-600">{apr.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-500">权益档位（用户实际拥有资金比例）</span>
                  <span className="font-medium">第{aprInfo.equityTier}档 · {(aprInfo.discountRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-gray-700 font-semibold">实际年化费率 = 名义年化 ÷ 档位比例</span>
                  <span className="font-bold" style={{ color: '#1e40af' }}>{(aprInfo.actualApr * 100).toFixed(2)}%</span>
                </div>
              </div>
              <button
                onClick={() => setAprInfo(null)}
                className="mt-4 w-full py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: '#2563eb' }}
              >
                知道了
              </button>
            </div>
          </div>
        );
      })()}

      {/* 只读订单详情弹窗 */}
      {detailOrder && (() => {
        const d = detailOrder;
        const amount = parseFloat(d.amount || '0');
        const statusText = d.feeType === 'settled' ? '已结清' : (d.sellStatus === 'selling' ? '委卖中' : '进行中');
        const Row = ({ k, v, color }: { k: string; v: any; color?: string }) => (
          <div className="flex justify-between border-b border-gray-100 py-2 text-xs">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium" style={color ? { color } : undefined}>{v}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setDetailOrder(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">订单详情</h3>
                <button onClick={() => setDetailOrder(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="space-y-0">
                <Row k="订单编号" v={<span className="font-mono">{d.orderNo}</span>} />
                <Row k="用户" v={d._nickname} />
                <Row k="类型" v={d.isGift ? '赠单' : '正单'} />
                <Row k="状态" v={statusText} />
                <Row k="币种" v={d.coin || '-'} />
                <Row k="下单金额" v={`${amount.toFixed(2)} U`} />
                <Row k="订单价值" v={`${(d.tradeValue || 0).toFixed(2)} U`} />
                <Row k="权益档位" v={`第${d.equityTier}档 · ${(d.discountRate * 100).toFixed(2)}%`} />
                <Row k="持有天数" v={`${d.holdDays} 天`} />
                <Row k="日费率" v={`${d.dailyFee.toFixed(4)} U`} />
                <Row k="累计管理费" v={`${d.totalFee.toFixed(2)} U`} />
                <Row k="名义年化" v={`${(d.nominalApr * 100).toFixed(2)}%`} color="#2563eb" />
                <Row k="实际年化" v={`${(d.actualApr * 100).toFixed(2)}%`} color="#1e40af" />
              </div>
              <button onClick={() => setDetailOrder(null)} className="mt-4 w-full py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#2563eb' }}>关闭</button>
            </div>
          </div>
        );
      })()}

      {/* 融资付息订单只读详情弹窗 */}
      {finDetailOrder && (() => {
        const d = finDetailOrder;
        const statusMap: Record<string, string> = { active: '进行中', settled: '已结清', completed: '已结清', cancelled: '已取消' };
        const baseRaw = d.interest_base != null ? Number(d.interest_base) : (d.amount != null ? Number(d.amount) : null);
        const isCNYOrder = (d.coin || '').toUpperCase() === 'CNY';
        const base = (baseRaw != null && isCNYOrder) ? baseRaw / cnyRate : baseRaw;
        const rate = d.interest_rate_annual != null ? Number(d.interest_rate_annual) : null;
        const start = d.interest_start_date || d.buy_date || '';
        const finAccrued = (base != null && rate != null && d._elapsedDays != null)
          ? base * (rate / 100) / 365 * d._elapsedDays : null;
        const finPaid = finPaidMap[Number(d.id)] != null ? Number(finPaidMap[Number(d.id)]) : 0;
        const Row = ({ k, v, color }: { k: string; v: any; color?: string }) => (
          <div className="flex justify-between border-b border-gray-100 py-2 text-xs">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium" style={color ? { color } : undefined}>{v}</span>
          </div>
        );
        const coinCfg: Record<string, { s: string; c: string }> = {
          BTC: { s: 'B', c: '#f59e0b' }, ETH: { s: 'E', c: '#3b82f6' }, SOL: { s: 'S', c: '#a855f7' },
        };
        const cc = coinCfg[d.coin];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setFinDetailOrder(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">融资付息订单详情</h3>
                <button onClick={() => setFinDetailOrder(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="space-y-0">
                <Row k="订单编号" v={<span className="font-mono">{d.order_no || '-'}</span>} />
                <Row k="用户" v={d.username || d.userName || '-'} />
                <Row k="币种" v={cc ? <span className="font-bold" style={{ color: cc.c }}>{d.coin}</span> : (d.coin || '-')} />
                <Row k="计息本金" v={base != null ? (
                  isCNYOrder
                    ? <span>{base.toFixed(2)} U <span className="text-gray-400 text-[10px]">（{baseRaw?.toFixed(0)} CNY ÷ {cnyRate.toFixed(4)}）</span></span>
                    : `${base.toFixed(2)} U`
                ) : '-'} />
                <Row k="年利率" v={rate != null ? `${rate}%` : '-'} />
                <Row k="起息日" v={start || '-'} />
                <Row k="天数" v={d._elapsedDays != null ? `${d._elapsedDays} 天` : '-'} />
                <Row k="日息" v={(base != null && rate != null) ? `${(Math.abs(base * (rate / 100) / 365)).toFixed(2)} U` : '-'} color="#6b7280" />
                <Row k="待付利息" v={finAccrued != null ? `${finAccrued.toFixed(2)} U` : '-'} color="#2563eb" />
                <Row k="已付利息" v={`${finPaid.toFixed(2)} U`} color="#16a34a" />
                <Row k="参与方数" v={d._participantCount != null ? `${d._participantCount} 人` : '-'} />
                <Row k="状态" v={statusMap[d.status] || d.status || '-'} />
              </div>
              <button onClick={() => setFinDetailOrder(null)} className="mt-4 w-full py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#2563eb' }}>关闭</button>
            </div>
          </div>
        );
      })()}

      {/* 预收管理费弹窗 */}
      {collectModal && (() => {
        const { order, totalFee, prepaidFee } = collectModal;
        const remaining = Math.max(0, totalFee - prepaidFee);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setCollectModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">预收管理费</h3>
                <button onClick={() => setCollectModal(null)} className="text-gray-400 text-xl">×</button>
              </div>
              <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">订单</span>
                  <span className="font-medium">{order.coin} #{order.id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">累计管理费</span>
                  <span className="font-bold text-gray-800">{totalFee.toFixed(4)} U</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">已付管理费</span>
                  <span className="font-bold text-green-600">{prepaidFee.toFixed(4)} U</span>
                </div>
                <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5">
                  <span className="text-gray-500">待付管理费</span>
                  <span className="font-bold text-orange-500">{remaining.toFixed(4)} U</span>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1 block">本次收取金额 (U)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max={remaining}
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  placeholder="输入金额"
                />
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1 block">备注（可选）</label>
                <input
                  type="text"
                  value={collectNote}
                  onChange={e => setCollectNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  placeholder="如：6月份管理费"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCollectModal(null)} className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 bg-gray-100">取消</button>
                <button
                  disabled={collectLoading || !collectAmount || parseFloat(collectAmount) <= 0}
                  onClick={async () => {
                    const amt = parseFloat(collectAmount);
                    if (isNaN(amt) || amt <= 0) return;
                    setCollectLoading(true);
                    try {
                      await collectMutation.mutateAsync({
                        ledgerId,
                        orderId: order.id,
                        amount: amt,
                        note: collectNote || undefined,
                      });
                      await utils.ledger.afAdminGetOrders.invalidate({ ledgerId });
                      setCollectModal(null);
                      alert(`预收成功！已从用户余额扣除 ${amt.toFixed(4)} U`);
                    } catch (e: any) {
                      alert('预收失败：' + (e.message || '未知错误'));
                    } finally {
                      setCollectLoading(false);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 disabled:opacity-50"
                >{collectLoading ? '处理中...' : '确认收费'}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
