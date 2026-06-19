import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

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
  const discountRate = EQUITY_DISCOUNT_RATES[equityTier] ?? 1.0;
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
  const [feeFilter, setFeeFilter] = useState<'all' | 'ongoing' | 'settled'>('all');
  const [aprInfo, setAprInfo] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [finDetailOrder, setFinDetailOrder] = useState<any | null>(null);
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
  // 过滤：只保留融资付息主订单（order_role='finance'），
  // 去掉共享者/参与方视角的跟随行（_isParticipant 或非 finance 角色）
  const financeOrders: any[] = financeOrdersRaw.filter(
    (o: any) => !o._isParticipant && (o.order_role == null || o.order_role === 'finance')
  );
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

  const filteredGroups = userGroups.map(g => ({
    ...g,
    orders: g.orders.filter(o => feeFilter === 'all' || o.feeType === feeFilter),
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

        {/* 三列卡片：管理费(进行中/已结清/累计) + 今日(管理费/订单数) */}
        {(() => {
          const nowBJ = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
          const todayStartBJ = new Date(nowBJ.getFullYear(), nowBJ.getMonth(), nowBJ.getDate());
          let todayFee = 0;
          let todayOrderCount = 0;
          for (const item of feeItems) {
            if (item.feeType === 'settled') {
              // 已卖出：卖出日是今天才计入
              const sellDate = item.sellConfirmedAt ? new Date(item.sellConfirmedAt) : null;
              if (sellDate) {
                const sellBJ = new Date(sellDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                const sellDay = new Date(sellBJ.getFullYear(), sellBJ.getMonth(), sellBJ.getDate());
                if (sellDay.getTime() >= todayStartBJ.getTime()) {
                  todayFee += item.dailyFee;
                  todayOrderCount += 1;
                }
              }
            } else {
              // 进行中（持仓中/委卖中）：每天都计费
              todayFee += item.dailyFee;
              todayOrderCount += 1;
            }
          }
          return (
            <div className="grid grid-cols-2 gap-2 px-4 pb-5 pt-3">
              {/* 管理费容器：进行中/已结清/累计 */}
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
              {/* 今日容器：今日管理费/订单数 */}
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
        })()}
      </div>

      {/* ── 筛选 Tab（仅谷底增筹） ── */}
      {mainTab === 'gujian' && (
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex gap-2 sticky top-0 z-10">
        {([
          { key: 'all' as const, label: `全部 ${userGroups.length} 人` },
          { key: 'ongoing' as const, label: '进行中' },
          { key: 'settled' as const, label: '已结清' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFeeFilter(tab.key)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={feeFilter === tab.key
              ? { background: '#2563eb', color: '#fff' }
              : { background: '#eff2f9', color: '#6b7280' }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {/* ── 谷底增筹：用户列表（表格） ── */}
      {mainTab === 'gujian' && (
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
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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
                          <span className="block text-[10px] text-gray-400 mt-0.5">{Math.round(parseFloat(item.amount || '0'))} U · <span className="font-semibold" style={{ color: '#0d9488' }}>D{item.equityTier}</span></span>
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
          const finOngoing = financeOrders.filter(o => !isFinSettled(o));
          const finSettled = financeOrders.filter(o => isFinSettled(o));
          const renderFinTable = (rows: any[], title: string) => {
            if (rows.length === 0) return null;
            const baseSum = rows.reduce((s, o) => s + (o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0)), 0);
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
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">{title}（{rows.length}）</div>
                <div className="overflow-x-auto">
                  <table className="border-collapse text-xs" style={{ width: 'auto', tableLayout: 'auto' }}>
                    <thead>
                      <tr style={{ background: '#f8faff' }} className="text-gray-500">
                        <th className="px-2 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap">用户</th>
                        <th className="px-2 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap">起息日</th>
                        <th className="px-2 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>币</th>
                        <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">天数</th>
                        <th className="px-2 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap">订单</th>
                        <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">计息本金</th>
                        <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">年利率</th>
                        <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">待付利息</th>
                        <th className="px-2 py-2 text-right font-semibold border border-gray-200 whitespace-nowrap">已付利息</th>
                        <th className="px-2 py-2 text-center font-semibold border border-gray-200 whitespace-nowrap">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o: any, i: number) => {
                        const base = o.interest_base != null ? Number(o.interest_base) : (o.amount != null ? Number(o.amount) : 0);
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
                            <td className="px-2 py-2 border border-gray-100 whitespace-nowrap">{o.username || o.userName || '-'}</td>
                            <td className="px-2 py-2 border border-gray-100 whitespace-nowrap">{start || '-'}</td>
                            <td className="px-2 py-2 text-center border border-gray-100 whitespace-nowrap" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
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
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">{elapsedDays != null ? elapsedDays : '-'}</td>
                            <td className="px-2 py-2 border border-gray-100 whitespace-nowrap">
                              <button type="button" onClick={() => setFinDetailOrder({ ...o, _elapsedDays: elapsedDays })} className="font-mono underline decoration-dotted underline-offset-2" style={{ color: '#2563eb' }}>{orderNoShort}</button>
                            </td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">{base ? base.toFixed(2) : '-'}</td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap">{rate != null ? rate + '%' : '-'}</td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap" style={{ color: '#2563eb' }}>{accrued != null ? accrued.toFixed(2) : '-'}</td>
                            <td className="px-2 py-2 text-right border border-gray-100 whitespace-nowrap" style={{ color: '#16a34a' }}>{paid.toFixed(2)}</td>
                            <td className="px-2 py-2 text-center border border-gray-100 whitespace-nowrap">{statusMap[o.status] || o.status || '-'}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#f8faff' }} className="font-semibold text-gray-700">
                        <td className="px-2 py-2 border border-gray-200 whitespace-nowrap">合计</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap">{baseSum.toFixed(2)}</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#2563eb' }}>{accruedSum.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right border border-gray-200 whitespace-nowrap" style={{ color: '#16a34a' }}>{paidSum.toFixed(2)}</td>
                        <td className="px-2 py-2 border border-gray-200"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          };
          return (
            <div className="space-y-4">
              {renderFinTable(finOngoing, '进行中')}
              {renderFinTable(finSettled, '已结清')}
            </div>
          );
        })()}
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
        const base = d.interest_base != null ? Number(d.interest_base) : (d.amount != null ? Number(d.amount) : null);
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
                <Row k="计息本金" v={base != null ? `${base.toFixed(2)} U` : '-'} />
                <Row k="年利率" v={rate != null ? `${rate}%` : '-'} />
                <Row k="起息日" v={start || '-'} />
                <Row k="天数" v={d._elapsedDays != null ? `${d._elapsedDays} 天` : '-'} />
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
    </div>
  );
}
