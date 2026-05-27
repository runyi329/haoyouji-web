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

  // 计算所有买单管理费（不含已撤单）
  const feeItems = ((orders as any[]) ?? [])
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map(calcFeeItem);

  // 按用户分组，保存 nickname 和 username
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

  // 每个用户汇总
  const userGroups = Array.from(userMap.values()).map(u => {
    const ongoingFee = u.orders.filter(o => o.feeType === 'ongoing').reduce((s, o) => s + o.totalFee, 0);
    const settledFee = u.orders.filter(o => o.feeType === 'settled').reduce((s, o) => s + o.totalFee, 0);
    const totalFee = ongoingFee + settledFee;
    const ongoingCount = u.orders.filter(o => o.feeType === 'ongoing').length;
    const settledCount = u.orders.filter(o => o.feeType === 'settled').length;
    return { ...u, ongoingFee, settledFee, totalFee, ongoingCount, settledCount };
  }).sort((a, b) => b.totalFee - a.totalFee);

  // 筛选后的用户组
  const filteredGroups = userGroups.map(g => ({
    ...g,
    orders: g.orders.filter(o => {
      if (feeFilter === 'all') return true;
      return o.feeType === feeFilter;
    }),
  })).filter(g => g.orders.length > 0);

  // 总计
  const totalOngoing = feeItems.filter(f => f.feeType === 'ongoing').reduce((s, f) => s + f.totalFee, 0);
  const totalSettled = feeItems.filter(f => f.feeType === 'settled').reduce((s, f) => s + f.totalFee, 0);
  const totalAll = totalOngoing + totalSettled;

  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // 蓝色主题色（与账本一致）
  const BLUE = '#1A56DB';
  const BLUE_DARK = '#1e40af';

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: '#f0f4ff' }}>
      {/* 顶部蓝色区域 */}
      <div style={{ background: `linear-gradient(135deg, ${BLUE_DARK} 0%, ${BLUE} 100%)` }}>
        {/* 导航栏 */}
        <div className="flex items-center px-4 pt-4 pb-2">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full mr-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-base font-semibold text-white">管理费明细</h1>
        </div>

        {/* 汇总卡片 */}
        <div className="px-4 pb-5 pt-2">
          <p className="text-xs text-white/60 mb-1">账本管理费总计</p>
          <div className="flex items-baseline gap-1.5 mb-4">
            <span className="text-3xl font-bold text-white">{totalAll.toFixed(2)}</span>
            <span className="text-sm text-white/60">U</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* 进行中 */}
            <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
              <p className="text-xs text-white/60 mb-1">进行中</p>
              <p className="text-lg font-bold text-amber-300">{totalOngoing.toFixed(2)} U</p>
              <p className="text-[10px] text-white/40 mt-0.5">{feeItems.filter(f => f.feeType === 'ongoing').length} 笔持仓</p>
            </div>
            {/* 已结清 */}
            <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
              <p className="text-xs text-white/60 mb-1">已结清</p>
              <p className="text-lg font-bold text-green-300">{totalSettled.toFixed(2)} U</p>
              <p className="text-[10px] text-white/40 mt-0.5">{feeItems.filter(f => f.feeType === 'settled').length} 笔已卖出</p>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选Tab */}
      <div className="px-4 py-3 flex gap-2 bg-white border-b border-gray-100 sticky top-0 z-10">
        {([
          { key: 'all' as const, label: `全部 ${userGroups.length} 人` },
          { key: 'ongoing' as const, label: `进行中` },
          { key: 'settled' as const, label: `已结清` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFeeFilter(tab.key)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={
              feeFilter === tab.key
                ? { backgroundColor: BLUE, color: '#fff' }
                : { backgroundColor: '#f0f4ff', color: '#6b7280' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 用户分组列表 */}
      <div className="px-3 pt-3 space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无记录</div>
        ) : (
          filteredGroups.map(group => {
            const isExpanded = expandedUsers.has(group.userId);
            const displayOngoing = group.orders.filter(o => o.feeType === 'ongoing').reduce((s, o) => s + o.totalFee, 0);
            const displaySettled = group.orders.filter(o => o.feeType === 'settled').reduce((s, o) => s + o.totalFee, 0);
            const displayTotal = displayOngoing + displaySettled;
            // 头像首字母：优先用昵称，否则用用户名
            const avatarChar = (group.nickname || group.username || '?').charAt(0).toUpperCase();
            return (
              <div key={group.userId} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-blue-50">
                {/* 用户行 */}
                <button
                  className="w-full px-4 py-3 flex items-center justify-between active:bg-blue-50"
                  onClick={() => toggleUser(group.userId)}
                >
                  <div className="flex items-center gap-2.5">
                    {/* 头像 */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${BLUE_DARK}, ${BLUE})` }}
                    >
                      {avatarChar}
                    </div>
                    <div className="text-left">
                      {/* 昵称（用户名）格式 */}
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{group.nickname}</span>
                        {group.username && group.username !== group.nickname && (
                          <span className="text-xs text-gray-400">({group.username})</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {group.orders.length} 笔订单
                        {group.ongoingCount > 0 && <span className="text-amber-500 ml-1">· 进行中 {group.ongoingCount}</span>}
                        {group.settledCount > 0 && <span className="text-green-500 ml-1">· 已结清 {group.settledCount}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right space-y-0.5">
                      <div className="flex items-baseline gap-1 justify-end">
                        <span className="text-[10px] text-gray-400">总计</span>
                        <span className="text-sm font-bold text-gray-900">{displayTotal.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-400">U</span>
                      </div>
                      {displayOngoing > 0 && (
                        <div className="flex items-baseline gap-1 justify-end">
                          <span className="text-[10px] text-amber-400">进行中</span>
                          <span className="text-xs font-medium text-amber-500">{displayOngoing.toFixed(2)}</span>
                        </div>
                      )}
                      {displaySettled > 0 && (
                        <div className="flex items-baseline gap-1 justify-end">
                          <span className="text-[10px] text-green-400">已结清</span>
                          <span className="text-xs font-medium text-green-500">{displaySettled.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    }
                  </div>
                </button>

                {/* 展开的订单明细 */}
                {isExpanded && (
                  <div className="border-t border-blue-50">
                    {/* 表头 */}
                    <div
                      className="grid px-4 py-2 text-[11px] text-gray-400"
                      style={{ gridTemplateColumns: '2.5fr 1fr 1fr 2fr', backgroundColor: '#f8faff' }}
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
                        style={{ gridTemplateColumns: '2.5fr 1fr 1fr 2fr' }}
                      >
                        <div>
                          <p className="text-[11px] font-mono text-gray-500 leading-tight">{item.orderNo}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {item.amount} U
                            {item.isGift && <span className="text-red-400 ml-1">赠</span>}
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
                          <p className={`text-[10px] mt-0.5 ${item.feeType === 'settled' ? 'text-green-500' : 'text-amber-500'}`}>
                            {item.feeType === 'settled' ? '已结清' : '进行中'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* 该用户小计 */}
                    <div
                      className="flex justify-between items-center px-4 py-2.5 border-t"
                      style={{ backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }}
                    >
                      <span className="text-xs font-medium" style={{ color: BLUE }}>小计</span>
                      <span className="text-sm font-bold" style={{ color: BLUE_DARK }}>{displayTotal.toFixed(4)} U</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
