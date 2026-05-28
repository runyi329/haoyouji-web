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
            <div className="grid grid-cols-3 gap-2 px-4 pb-5 pt-3">
              {/* 管理费容器：进行中/已结清/累计 */}
              <div className="col-span-2 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
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

                {/* 第二行： Excel 表格样式，三列带横竖线 */}
                <div className="border-t border-gray-100 mx-4 mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                  {/* 表头行 */}
                  <div className="grid grid-cols-3" style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb' }}>
                    <div className="py-1.5 text-center">
                      <span className="text-[10px] text-gray-500 font-medium">总计</span>
                    </div>
                    <div className="py-1.5 text-center" style={{ borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                      <span className="text-[10px] text-amber-500 font-medium">进行中</span>
                    </div>
                    <div className="py-1.5 text-center">
                      <span className="text-[10px] text-emerald-500 font-medium">已结清</span>
                    </div>
                  </div>
                  {/* 金额行 */}
                  <div className="grid grid-cols-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <div className="py-2 text-center">
                      <span className="text-xs font-bold text-gray-900 whitespace-nowrap">{dispTotal.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-400 ml-0.5">U</span>
                    </div>
                    <div className="py-2 text-center" style={{ borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                      <span className="text-xs font-bold text-amber-500 whitespace-nowrap">{dispOngoing > 0 ? dispOngoing.toFixed(2) : '—'}</span>
                      {dispOngoing > 0 && <span className="text-[10px] text-amber-300 ml-0.5">U</span>}
                    </div>
                    <div className="py-2 text-center">
                      <span className="text-xs font-bold text-emerald-500 whitespace-nowrap">{dispSettled > 0 ? dispSettled.toFixed(2) : '—'}</span>
                      {dispSettled > 0 && <span className="text-[10px] text-emerald-300 ml-0.5">U</span>}
                    </div>
                  </div>
                  {/* 笔数行 */}
                  <div className="grid grid-cols-3" style={{ background: '#fafafa' }}>
                    <div className="py-1.5 text-center">
                      <span className="text-[10px] text-gray-400">{group.orders.length} 笔</span>
                    </div>
                    <div className="py-1.5 text-center" style={{ borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                      <span className="text-[10px] text-amber-400">{group.ongoingCount} 笔</span>
                    </div>
                    <div className="py-1.5 text-center">
                      <span className="text-[10px] text-emerald-400">{group.settledCount} 笔</span>
                    </div>
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
