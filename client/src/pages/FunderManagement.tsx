import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Pencil, Trash2, User, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// 币种选项
const COIN_OPTIONS = ['BTC', 'ETH', 'SOL'] as const;
type CoinType = typeof COIN_OPTIONS[number];

const STATUS_OPTIONS = [
  { value: 'active', label: '持有中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

const COIN_COLORS: Record<CoinType, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

export default function FunderManagement() {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);

  const [formData, setFormData] = useState({
    userId: 0,
    coin: 'BTC' as CoinType,
    amount: '',
    buyPrice: '',
    buyDate: '',
    buyQuantity: '',
    storageAccount: '',
    status: 'active',
    adminNote: '',
  });

  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  const { data: assetOrders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}) },
    { enabled: ledgerId > 0 }
  );

  const createMutation = trpc.ledger.funderCreateAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('创建成功');
      setShowForm(false);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.ledger.funderUpdateAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('更新成功');
      setShowForm(false);
      setEditingOrder(null);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('删除成功');
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenCreate = (userId: number) => {
    setFormData({
      userId,
      coin: 'BTC',
      amount: '',
      buyPrice: '',
      buyDate: '',
      buyQuantity: '',
      storageAccount: '',
      status: 'active',
      adminNote: '',
    });
    setEditingOrder(null);
    setShowForm(true);
  };

  const handleOpenEdit = (order: any) => {
    setFormData({
      userId: order.user_id,
      coin: order.coin as CoinType,
      amount: order.amount,
      buyPrice: order.buy_price || '',
      buyDate: order.buy_date || '',
      buyQuantity: order.buy_quantity || '',
      storageAccount: order.storage_account || '',
      status: order.status,
      adminNote: order.admin_note || '',
    });
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('请输入有效的投入金额');
      return;
    }
    if (editingOrder) {
      updateMutation.mutate({
        id: editingOrder.id,
        ledgerId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice || undefined,
        buyDate: formData.buyDate || undefined,
        buyQuantity: formData.buyQuantity || undefined,
        storageAccount: formData.storageAccount || undefined,
        status: formData.status,
        adminNote: formData.adminNote || undefined,
      });
    } else {
      createMutation.mutate({
        ledgerId,
        userId: formData.userId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice || undefined,
        buyDate: formData.buyDate || undefined,
        buyQuantity: formData.buyQuantity || undefined,
        storageAccount: formData.storageAccount || undefined,
        adminNote: formData.adminNote || undefined,
      });
    }
  };

  const handleDelete = (orderId: number) => {
    if (!confirm('确定要删除这笔订单吗？')) return;
    deleteMutation.mutate({ id: orderId, ledgerId });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4FF' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">资方管理</h1>
      </div>

      <div className="px-4 py-4">
        {/* 资金方用户列表 */}
        <div className="mb-4">
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">选择资金方</h2>
          {usersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !funderUsers || (funderUsers as any[]).length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
              <User className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无资金方用户</div>
              <div className="text-gray-300 text-xs mt-1">请先在成员管理中将用户设为资金方角色</div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedUserId(null)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedUserId === null ? 'text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200'
                }`}
                style={selectedUserId === null ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' } : {}}
              >
                全部
              </button>
              {(funderUsers as any[]).map((u: any) => (
                <button
                  key={u.userId}
                  onClick={() => setSelectedUserId(u.userId)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedUserId === u.userId ? 'text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200'
                  }`}
                  style={selectedUserId === u.userId ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' } : {}}
                >
                  {u.nickname || u.name || u.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 新增订单按钮 */}
        {selectedUserId && (
          <div className="mb-4">
            <button
              onClick={() => handleOpenCreate(selectedUserId)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              <Plus className="w-4 h-4" />
              添加订单
            </button>
          </div>
        )}

        {/* 订单列表 */}
        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            订单列表 {assetOrders ? `· ${(assetOrders as any[]).length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !assetOrders || (assetOrders as any[]).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {(assetOrders as any[]).map((order: any) => {
                const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
                const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl p-4 shadow-sm"
                    style={{ border: '1px solid #E5EDFF' }}
                  >
                    {/* 头部 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold px-2.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: coinColor }}
                        >
                          {order.coin}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {order.userName || order.username}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleOpenEdit(order)} className="p-1.5 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(order.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 投入金额 */}
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-xl font-bold" style={{ color: '#1A2340' }}>
                        {parseFloat(order.amount).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400">USDT 投入</span>
                    </div>

                    {/* 详情网格 */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {order.buy_price && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入价</span>
                          <span className="font-medium text-gray-700">{order.buy_price} U</span>
                        </div>
                      )}
                      {order.buy_date && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入日期</span>
                          <span className="font-medium text-gray-700">{order.buy_date}</span>
                        </div>
                      )}
                      {order.buy_quantity && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入数量</span>
                          <span className="font-medium text-gray-700">{order.buy_quantity} {order.coin}</span>
                        </div>
                      )}
                      {order.storage_account && (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400">存放账号</span>
                          <span className="font-medium text-gray-700 truncate">{order.storage_account}</span>
                        </div>
                      )}
                    </div>

                    {order.admin_note && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                        备注：{order.admin_note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder ? '编辑订单' : '添加订单'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingOrder(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* 币种 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">币种</label>
                <div className="flex gap-2">
                  {COIN_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData(d => ({ ...d, coin: c }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={
                        formData.coin === c
                          ? { backgroundColor: COIN_COLORS[c], color: '#fff', boxShadow: `0 4px 12px ${COIN_COLORS[c]}40` }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* 投入金额 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  投入金额（USDT）<span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="输入USDT金额"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 买入价格 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">买入价格（USDT）</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formData.buyPrice}
                  onChange={e => setFormData(d => ({ ...d, buyPrice: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：65000"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 买入日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">买入日期</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.buyDate}
                  onChange={e => setFormData(d => ({ ...d, buyDate: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：2026-03-24"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 买入数量 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  买入数量（{formData.coin}）
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formData.buyQuantity}
                  onChange={e => setFormData(d => ({ ...d, buyQuantity: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder={`如：0.5`}
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 存放账号 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">存放账号</label>
                <input
                  type="text"
                  value={formData.storageAccount}
                  onChange={e => setFormData(d => ({ ...d, storageAccount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="填写存放的交易所或钱包账号"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 状态（编辑时可修改） */}
              {editingOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">订单状态</label>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFormData(d => ({ ...d, status: s.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={
                          formData.status === s.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 管理员备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">管理员备注</label>
                <textarea
                  value={formData.adminNote}
                  onChange={e => setFormData(d => ({ ...d, adminNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="内部备注（资金方不可见）"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>
            </div>

            {/* 提交按钮 */}
            <div className="sticky bottom-0 bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
              >
                {(createMutation.isPending || updateMutation.isPending) ? '提交中...' : (editingOrder ? '保存修改' : '确认添加')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
