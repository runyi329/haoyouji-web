import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

function calcFeeItem(o: any) {
  const amount = parseFloat(o.amount || '0');
  const tradeValue = o.isGift ? amount : amount * 5.25;
  const dailyFee = tradeValue / 0.75 * 0.12 / 365;
  const confirmedDate = new Date(o.updatedAt || o.createdAt);
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
  const orderDate = new Date(o.createdAt);
  const yy = String(orderDate.getFullYear()).slice(2);
  const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
  const dd = String(orderDate.getDate()).padStart(2, '0');
  const orderNo = `AF${yy}${mm}${dd}${String(o.id).padStart(6, '0')}`;
  return { ...o, orderNo, holdDays, dailyFee, totalFee, feeType, tradeValue };
}

export default function AfFeeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [feeFilter, setFeeFilter] = useState<'all' | 'ongoing' | 'settled'>('all');

  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

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
        </div>

        {/* 总计大数字 */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-white/60 text-xs mb-1">账本管理费总计</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold text-white tracking-tight">{totalAll.toFixed(2)}</span>
            <span className="text-sm text-white/50 font-normal">U</span>
          </div>
        </div>

        {/* 进行中 / 已结清 两列 */}
        <div className="grid grid-cols-2 gap-3 px-4 pb-5 pt-3">
          <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
            <p className="text-white/55 text-xs mb-1">进行中</p>
            <p className="text-xl font-bold text-amber-300 leading-tight">{totalOngoing.toFixed(2)}<span className="text-sm font-normal ml-1">U</span></p>
            <p className="text-white/35 text-[10px] mt-1">{feeItems.filter(f => f.feeType === 'ongoing').length} 笔持仓</p>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
            <p className="text-white/55 text-xs mb-1">已结清</p>
            <p className="text-xl font-bold text-emerald-300 leading-tight">{totalSettled.toFixed(2)}<span className="text-sm font-normal ml-1">U</span></p>
            <p className="text-white/35 text-[10px] mt-1">{feeItems.filter(f => f.feeType === 'settled').length} 笔已卖出</p>
          </div>
        </div>
      </div>

      {/* ── 筛选 Tab ── */}
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

      {/* ── 用户列表 ── */}
      <div className="px-3 pt-3 space-y-2.5">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">加载中…</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无记录</div>
        ) : filteredGroups.map(group => {
          const isExpanded = expandedUsers.has(group.userId);
          const dispOngoing = group.orders.filter(o => o.feeType === 'ongoing').reduce((s, o) => s + o.totalFee, 0);
          const dispSettled = group.orders.filter(o => o.feeType === 'settled').reduce((s, o) => s + o.totalFee, 0);
          const dispTotal = dispOngoing + dispSettled;
          const avatarChar = (group.nickname || group.username || '?').charAt(0).toUpperCase();

          return (
            <div key={group.userId} className="bg-white rounded-2xl overflow-hidden shadow-sm">

              {/* ── 用户卡片主体（可点击展开） ── */}
              <button className="w-full text-left" onClick={() => toggleUser(group.userId)}>

                {/* 第一行：头像 + 姓名 + 箭头 */}
                <div className="flex items-center px-4 pt-3.5 pb-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mr-3"
                    style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}
                  >
                    {avatarChar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 leading-tight">{group.nickname}</span>
                      {group.username && group.username !== group.nickname && (
                        <span className="text-xs text-gray-400">({group.username})</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      共 {group.orders.length} 笔
                      {group.ongoingCount > 0 && <span className="text-amber-500 ml-1">· 进行中 {group.ongoingCount}</span>}
                      {group.settledCount > 0 && <span className="text-emerald-500 ml-1">· 已结清 {group.settledCount}</span>}
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                </div>

                {/* 第二行：三列数字横排 */}
                <div className="grid grid-cols-3 border-t border-gray-50 pb-3.5">
                  {/* 总计 */}
                  <div className="flex flex-col items-center pt-2.5 px-2">
                    <span className="text-[10px] text-gray-400 mb-0.5">总计</span>
                    <span className="text-sm font-bold text-gray-900 leading-tight">{dispTotal.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">U</span>
                  </div>
                  {/* 进行中 */}
                  <div className="flex flex-col items-center pt-2.5 px-2 border-l border-r border-gray-50">
                    <span className="text-[10px] text-amber-400 mb-0.5">进行中</span>
                    <span className="text-sm font-bold text-amber-500 leading-tight">
                      {dispOngoing > 0 ? dispOngoing.toFixed(2) : '—'}
                    </span>
                    <span className="text-[10px] text-amber-300">{dispOngoing > 0 ? 'U' : ''}</span>
                  </div>
                  {/* 已结清 */}
                  <div className="flex flex-col items-center pt-2.5 px-2">
                    <span className="text-[10px] text-emerald-400 mb-0.5">已结清</span>
                    <span className="text-sm font-bold text-emerald-500 leading-tight">
                      {dispSettled > 0 ? dispSettled.toFixed(2) : '—'}
                    </span>
                    <span className="text-[10px] text-emerald-300">{dispSettled > 0 ? 'U' : ''}</span>
                  </div>
                </div>
              </button>

              {/* ── 展开的订单明细 ── */}
              {isExpanded && (
                <div className="border-t border-blue-50">
                  {/* 表头 */}
                  <div
                    className="grid px-4 py-2 text-[11px] text-gray-400"
                    style={{ gridTemplateColumns: '2.6fr 0.8fr 0.8fr 1.8fr', background: '#f8faff' }}
                  >
                    <span>订单号</span>
                    <span className="text-center">币种</span>
                    <span className="text-center">天数</span>
                    <span className="text-right">管理费</span>
                  </div>
                  {group.orders.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`grid px-4 py-2.5 items-center ${idx < group.orders.length - 1 ? 'border-b border-gray-50' : ''}`}
                      style={{ gridTemplateColumns: '2.6fr 0.8fr 0.8fr 1.8fr' }}
                    >
                      <div>
                        <p className="text-[11px] font-mono text-gray-500 leading-tight">{item.orderNo}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {item.amount} U{item.isGift && <span className="text-red-400 ml-1">赠</span>}
                        </p>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-gray-700">{item.coin}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-gray-600">{item.holdDays}天</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{item.totalFee.toFixed(4)}</p>
                        <p className={`text-[10px] mt-0.5 ${item.feeType === 'settled' ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {item.feeType === 'settled' ? '已结清' : '进行中'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {/* 小计 */}
                  <div className="flex justify-between items-center px-4 py-2.5 border-t border-blue-100" style={{ background: '#eff6ff' }}>
                    <span className="text-xs font-medium text-blue-500">小计</span>
                    <span className="text-sm font-bold text-blue-700">{dispTotal.toFixed(4)} U</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
