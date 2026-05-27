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

  // 计算所有买单管理费
  const feeItems = ((orders as any[]) ?? [])
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map(calcFeeItem);

  // 按用户分组
  const userMap = new Map<string, { userId: string; name: string; orders: ReturnType<typeof calcFeeItem>[] }>();
  for (const item of feeItems) {
    const uid = String(item.userId || item.username || 'unknown');
    const name = item.nickname || item.username || uid;
    if (!userMap.has(uid)) {
      userMap.set(uid, { userId: uid, name, orders: [] });
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

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/af-order-manage`)} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold">管理费明细</h1>
        </div>
      </div>

      {/* 汇总栏 */}
      <div className="bg-white border-b px-4 py-4">
        <p className="text-xs text-gray-400 mb-2">账本管理费总计</p>
        <p className="text-3xl font-bold text-purple-700 mb-3">{totalAll.toFixed(2)} <span className="text-base font-normal text-gray-400">U</span></p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-orange-400 mb-0.5">进行中</p>
            <p className="text-base font-bold text-orange-500">{totalOngoing.toFixed(2)} U</p>
            <p className="text-[10px] text-orange-300 mt-0.5">{feeItems.filter(f => f.feeType === 'ongoing').length} 笔持仓</p>
          </div>
          <div className="bg-green-50 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-green-500 mb-0.5">已结清</p>
            <p className="text-base font-bold text-green-600">{totalSettled.toFixed(2)} U</p>
            <p className="text-[10px] text-green-400 mt-0.5">{feeItems.filter(f => f.feeType === 'settled').length} 笔已卖出</p>
          </div>
        </div>
      </div>

      {/* 筛选Tab */}
      <div className="bg-white border-b px-4 py-2 flex gap-2">
        {([
          { key: 'all' as const, label: `全部 ${userGroups.length} 人` },
          { key: 'ongoing' as const, label: `进行中` },
          { key: 'settled' as const, label: `已结清` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFeeFilter(tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              feeFilter === tab.key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
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
            return (
              <div key={group.userId} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                {/* 用户行 - 点击展开/收起 */}
                <button
                  className="w-full px-4 py-3 flex items-center justify-between"
                  onClick={() => toggleUser(group.userId)}
                >
                  <div className="flex items-center gap-2.5">
                    {/* 头像 */}
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-purple-600">
                        {(group.name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{group.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {group.orders.length} 笔订单
                        {group.ongoingCount > 0 && <span className="text-orange-400 ml-1">· 进行中 {group.ongoingCount}</span>}
                        {group.settledCount > 0 && <span className="text-green-500 ml-1">· 已结清 {group.settledCount}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-900">{displayTotal.toFixed(2)} U</p>
                      {feeFilter === 'all' && (
                        <div className="flex gap-2 text-[11px] justify-end mt-0.5">
                          {group.ongoingFee > 0 && <span className="text-orange-400">{group.ongoingFee.toFixed(2)}</span>}
                          {group.settledFee > 0 && <span className="text-green-500">{group.settledFee.toFixed(2)}</span>}
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
                  <div className="border-t border-gray-100">
                    {/* 表头 */}
                    <div className="grid px-4 py-2 text-[11px] text-gray-400 bg-gray-50"
                      style={{ gridTemplateColumns: '2.5fr 1fr 1fr 2fr' }}>
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
                          <p className={`text-[10px] mt-0.5 ${item.feeType === 'settled' ? 'text-green-500' : 'text-orange-400'}`}>
                            {item.feeType === 'settled' ? '已结清' : '进行中'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* 该用户小计 */}
                    <div className="flex justify-between items-center px-4 py-2.5 bg-purple-50 border-t border-purple-100">
                      <span className="text-xs text-purple-500 font-medium">小计</span>
                      <span className="text-sm font-bold text-purple-700">{displayTotal.toFixed(4)} U</span>
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
