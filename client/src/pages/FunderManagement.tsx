import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Pencil, Trash2, User, DollarSign } from "lucide-react";
import { toast } from "sonner";

// 币种选项
const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'USDT'];
const STATUS_OPTIONS = [
  { value: 'active', label: '进行中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

export default function FunderManagement() {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // 当前选中的资金方用户
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  // 编辑弹窗
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  // 表单字段
  const [formData, setFormData] = useState({
    userId: 0,
    coin: 'BTC',
    amount: '',
    quantity: '',
    startAt: '',
    endAt: '',
    interestType: '',
    interestRate: '',
    interestNote: '',
    profitShareType: '',
    profitShareRate: '',
    profitShareNote: '',
    status: 'active',
    adminNote: '',
  });

  // 获取资金方用户列表
  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 获取资产订单列表
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
      quantity: '',
      startAt: '',
      endAt: '',
      interestType: '',
      interestRate: '',
      interestNote: '',
      profitShareType: '',
      profitShareRate: '',
      profitShareNote: '',
      status: 'active',
      adminNote: '',
    });
    setEditingOrder(null);
    setShowForm(true);
  };

  const handleOpenEdit = (order: any) => {
    setFormData({
      userId: order.user_id,
      coin: order.coin,
      amount: order.amount,
      quantity: order.quantity || '',
      startAt: order.start_at ? new Date(order.start_at).toISOString().slice(0, 10) : '',
      endAt: order.end_at ? new Date(order.end_at).toISOString().slice(0, 10) : '',
      interestType: order.interest_type || '',
      interestRate: order.interest_rate || '',
      interestNote: order.interest_note || '',
      profitShareType: order.profit_share_type || '',
      profitShareRate: order.profit_share_rate || '',
      profitShareNote: order.profit_share_note || '',
      status: order.status,
      adminNote: order.admin_note || '',
    });
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('请输入有效金额');
      return;
    }
    if (editingOrder) {
      updateMutation.mutate({
        id: editingOrder.id,
        ledgerId,
        coin: formData.coin,
        amount: formData.amount,
        quantity: formData.quantity || undefined,
        startAt: formData.startAt || undefined,
        endAt: formData.endAt || undefined,
        interestType: formData.interestType || undefined,
        interestRate: formData.interestRate || undefined,
        interestNote: formData.interestNote || undefined,
        profitShareType: formData.profitShareType || undefined,
        profitShareRate: formData.profitShareRate || undefined,
        profitShareNote: formData.profitShareNote || undefined,
        status: formData.status,
        adminNote: formData.adminNote || undefined,
      });
    } else {
      createMutation.mutate({
        ledgerId,
        userId: formData.userId,
        coin: formData.coin,
        amount: formData.amount,
        quantity: formData.quantity || undefined,
        startAt: formData.startAt || undefined,
        endAt: formData.endAt || undefined,
        interestType: formData.interestType || undefined,
        interestRate: formData.interestRate || undefined,
        interestNote: formData.interestNote || undefined,
        profitShareType: formData.profitShareType || undefined,
        profitShareRate: formData.profitShareRate || undefined,
        profitShareNote: formData.profitShareNote || undefined,
        adminNote: formData.adminNote || undefined,
      });
    }
  };

  const handleDelete = (orderId: number) => {
    if (!confirm('确定要删除这条资产订单吗？')) return;
    deleteMutation.mutate({ id: orderId, ledgerId });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F7FF' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#3B5BDB' }}>
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">资方管理</h1>
      </div>

      <div className="px-4 py-4">
        {/* 资金方用户列表 */}
        <div className="mb-4">
          <h2 className="text-sm font-medium text-gray-500 mb-2">资金方用户</h2>
          {usersLoading ? (
            <div className="text-center py-4 text-gray-400">加载中...</div>
          ) : !funderUsers || (funderUsers as any[]).length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl">
              <User className="w-12 h-12 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无资金方用户</div>
              <div className="text-gray-400 text-xs mt-1">请先在成员管理中将用户设为"资金方"角色</div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedUserId(null)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedUserId === null
                    ? 'text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200'
                }`}
                style={selectedUserId === null ? { backgroundColor: '#3B5BDB' } : {}}
              >
                全部
              </button>
              {(funderUsers as any[]).map((u: any) => (
                <button
                  key={u.userId}
                  onClick={() => setSelectedUserId(u.userId)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedUserId === u.userId
                      ? 'text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                  style={selectedUserId === u.userId ? { backgroundColor: '#3B5BDB' } : {}}
                >
                  {u.nickname || u.name || u.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {selectedUserId && (
          <div className="mb-4">
            <button
              onClick={() => handleOpenCreate(selectedUserId)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-md"
              style={{ backgroundColor: '#3B5BDB' }}
            >
              <Plus className="w-4 h-4" />
              新增资产订单
            </button>
          </div>
        )}

        {/* 资产订单列表 */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">
            资产订单 {assetOrders ? `(${(assetOrders as any[]).length}笔)` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400">加载中...</div>
          ) : !assetOrders || (assetOrders as any[]).length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl">
              <DollarSign className="w-12 h-12 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无资产订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {(assetOrders as any[]).map((order: any) => {
                const statusLabel = order.status === 'active' ? '进行中' : order.status === 'settled' ? '已结算' : '已取消';
                const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl p-4 shadow-sm"
                    style={{ border: '1px solid #E0E8FF' }}
                  >
                    {/* 头部：用户 + 状态 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{order.userName || order.username}</span>
                        <span className="text-base font-bold" style={{ color: '#1A2340' }}>{order.coin}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>{statusLabel}</span>
                        <button onClick={() => handleOpenEdit(order)} className="p-1 text-gray-400 hover:text-blue-500">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(order.id)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* 金额 */}
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-xl font-bold" style={{ color: '#1A2340' }}>{parseFloat(order.amount).toLocaleString()}</span>
                      <span className="text-xs text-gray-400">USDT</span>
                      {order.quantity && (
                        <span className="text-xs text-gray-400 ml-2">数量: {order.quantity} {order.coin}</span>
                      )}
                    </div>
                    {/* 详情 */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                      {order.start_at && <div>开始: {new Date(order.start_at).toLocaleDateString('zh-CN')}</div>}
                      {order.end_at && <div>结束: {new Date(order.end_at).toLocaleDateString('zh-CN')}</div>}
                      {order.interest_rate && <div>利率: {order.interest_rate}%</div>}
                      {order.profit_share_rate && <div>分成: {order.profit_share_rate}%</div>}
                    </div>
                    {(order.interest_note || order.profit_share_note || order.admin_note) && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                        {order.interest_note && <div>利息协议: {order.interest_note}</div>}
                        {order.profit_share_note && <div>分成协议: {order.profit_share_note}</div>}
                        {order.admin_note && <div>备注: {order.admin_note}</div>}
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
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-lg font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder ? '编辑资产订单' : '新增资产订单'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingOrder(null); }} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 币种 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">币种</label>
                <div className="flex gap-2">
                  {COIN_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData(d => ({ ...d, coin: c }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium ${
                        formData.coin === c ? 'text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                      style={formData.coin === c ? { backgroundColor: '#3B5BDB' } : {}}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {/* 金额 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">金额 (USDT) *</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="输入USDT金额"
                />
              </div>
              {/* 数量 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">数量 ({formData.coin})</label>
                <input
                  type="text"
                  value={formData.quantity}
                  onChange={e => setFormData(d => ({ ...d, quantity: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder={`输入${formData.coin}数量（选填）`}
                />
              </div>
              {/* 日期 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={formData.startAt}
                    onChange={e => setFormData(d => ({ ...d, startAt: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={formData.endAt}
                    onChange={e => setFormData(d => ({ ...d, endAt: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              {/* 利息协议 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">利率 (%)</label>
                <input
                  type="text"
                  value={formData.interestRate}
                  onChange={e => setFormData(d => ({ ...d, interestRate: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="年化利率（选填）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">利息协议备注</label>
                <textarea
                  value={formData.interestNote}
                  onChange={e => setFormData(d => ({ ...d, interestNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="利息协议说明（选填）"
                />
              </div>
              {/* 分成协议 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">分成比例 (%)</label>
                <input
                  type="text"
                  value={formData.profitShareRate}
                  onChange={e => setFormData(d => ({ ...d, profitShareRate: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="利润分成比例（选填）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">分成协议备注</label>
                <textarea
                  value={formData.profitShareNote}
                  onChange={e => setFormData(d => ({ ...d, profitShareNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="分成协议说明（选填）"
                />
              </div>
              {/* 状态（编辑时可修改） */}
              {editingOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">状态</label>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFormData(d => ({ ...d, status: s.value }))}
                        className={`px-4 py-2 rounded-full text-sm font-medium ${
                          formData.status === s.value ? 'text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                        style={formData.status === s.value ? { backgroundColor: '#3B5BDB' } : {}}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 管理员备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">管理员备注</label>
                <textarea
                  value={formData.adminNote}
                  onChange={e => setFormData(d => ({ ...d, adminNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="内部备注（选填，资金方不可见）"
                />
              </div>
            </div>
            {/* 提交按钮 */}
            <div className="sticky bottom-0 bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="w-full py-3 rounded-xl text-white font-medium text-base disabled:opacity-50"
                style={{ backgroundColor: '#3B5BDB' }}
              >
                {(createMutation.isPending || updateMutation.isPending) ? '提交中...' : (editingOrder ? '保存修改' : '创建订单')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
