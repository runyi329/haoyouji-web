import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function AfFeeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [feeFilter, setFeeFilter] = useState<'all' | 'ongoing' | 'settled'>('all');

  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const feeItems = ((orders as any[]) ?? [])
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map((o: any) => {
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
    })
    .sort((a: any, b: any) => b.totalFee - a.totalFee);

  const totalOngoing = feeItems.filter(f => f.feeType === 'ongoing').reduce((s, f) => s + f.totalFee, 0);
  const totalSettled = feeItems.filter(f => f.feeType === 'settled').reduce((s, f) => s + f.totalFee, 0);
  const totalAll = totalOngoing + totalSettled;

  const filtered = feeItems.filter(f => {
    if (feeFilter === 'all') return true;
    if (feeFilter === 'ongoing') return f.feeType === 'ongoing';
    if (feeFilter === 'settled') return f.feeType === 'settled';
    return true;
  });

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
      <div className="bg-white border-b px-4 py-3">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="text-center pr-2">
            <p className="text-[11px] text-gray-400 mb-0.5">合计</p>
            <p className="text-base font-bold text-gray-800">{totalAll.toFixed(2)} U</p>
          </div>
          <div className="text-center px-2">
            <p className="text-[11px] text-gray-400 mb-0.5">进行中</p>
            <p className="text-base font-bold text-orange-500">{totalOngoing.toFixed(2)} U</p>
          </div>
          <div className="text-center pl-2">
            <p className="text-[11px] text-gray-400 mb-0.5">已结清</p>
            <p className="text-base font-bold text-green-600">{totalSettled.toFixed(2)} U</p>
          </div>
        </div>
      </div>

      {/* 筛选Tab */}
      <div className="bg-white border-b px-4 py-2 flex gap-2">
        {([
          { key: 'all' as const, label: `全部 ${feeItems.length}` },
          { key: 'ongoing' as const, label: `进行中 ${feeItems.filter(f => f.feeType === 'ongoing').length}` },
          { key: 'settled' as const, label: `已结清 ${feeItems.filter(f => f.feeType === 'settled').length}` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFeeFilter(tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              feeFilter === tab.key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 明细列表 */}
      <div className="px-3 pt-2">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无记录</div>
        ) : (
          <div className="space-y-0">
            {filtered.map((item: any, idx: number) => (
              <div
                key={item.id}
                className={`bg-white px-3 py-2.5 ${idx < filtered.length - 1 ? 'border-b border-gray-100' : ''} ${idx === 0 ? 'rounded-t-xl' : ''} ${idx === filtered.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                {/* 第一行：订单号 + 状态 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-gray-400 tracking-wide">{item.orderNo}</span>
                  <span className={`text-[11px] font-medium ${item.feeType === 'settled' ? 'text-gray-400' : 'text-orange-500'}`}>
                    {item.feeType === 'settled' ? '已结清' : '进行中'}
                  </span>
                </div>
                {/* 第二行：用户名 + 管理费金额 */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-800">{item.nickname || item.username}</span>
                    {item.isGift && (
                      <span className="text-[10px] text-red-400 bg-red-50 px-1 rounded">赠</span>
                    )}
                    <span className="text-[11px] text-gray-400">{item.coin}</span>
                  </div>
                  <span className="text-base font-bold text-gray-900">{item.totalFee.toFixed(4)} U</span>
                </div>
                {/* 第三行：三列数据 */}
                <div className="grid grid-cols-3 gap-1">
                  <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-[10px] text-gray-400">订单价值</p>
                    <p className="text-xs font-semibold text-gray-700">{item.tradeValue.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-[10px] text-gray-400">持有天数</p>
                    <p className="text-xs font-semibold text-gray-700">{item.holdDays} 天</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-[10px] text-gray-400">日费率</p>
                    <p className="text-xs font-semibold text-gray-700">{item.dailyFee.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
