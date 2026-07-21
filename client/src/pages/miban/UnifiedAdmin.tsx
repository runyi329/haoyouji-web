// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc, cosImg } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import InventoryPanel from "./InventoryPanel";
import {
  Package, Wheat, Users, BarChart3, Truck, Loader2,
  ChevronLeft, Settings, TrendingUp, Warehouse, Copy,
  ShieldCheck, UserCog, Percent, Building2, Search, X,
  CheckSquare, Square, Trash2, Download, MessageSquare,
  Calendar, Filter, ClipboardList, RotateCcw, AlertCircle,
  ChevronDown, ChevronUp, Edit3, Check
} from "lucide-react";

// ─── 奖金预览子组件 ──────────────────────────────────────────────────────────
function CommissionPreviewBadge({ orderId }: { orderId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = mtrpc.order.commissionPreview.useQuery(
    { orderId },
    { enabled: open, staleTime: 60_000 }
  );

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border"
        style={{ borderColor: '#FF6900', color: '#FF6900', background: open ? '#FFF5EE' : 'transparent' }}
      >
        <Percent className="w-3 h-3" />
        {open ? '收起奖金预览' : '奖金预览'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5 space-y-1.5">
          {isLoading ? (
            <p className="text-[11px] text-gray-400">计算中...</p>
          ) : !data || data.noConfig ? (
            <p className="text-[11px] text-gray-400">未配置奖金制度，此订单不触发分佣</p>
          ) : (
            <>
              {/* 制度标签 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {data.isFallback ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">兜底制度</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">团队：{data.teamName ?? '未知'}</span>
                )}
                {data.planName && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">{data.planName}</span>
                )}
              </div>
              {/* 分配明细 */}
              {(data.items ?? []).length === 0 ? (
                <p className="text-[11px] text-gray-400">推荐链无上级，无人可分佣</p>
              ) : (
                <div className="space-y-1">
                  {(data.items ?? []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-100 text-gray-500 flex-shrink-0">{item.levelLabel}</span>
                        <span className="text-[11px] text-gray-700 truncate">{item.userName}</span>
                      </div>
                      <span className="text-[12px] font-bold flex-shrink-0 ml-2" style={{ color: '#FF6900' }}>¥{item.commCny.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* 合计 */}
              <div className="pt-1 border-t border-orange-100 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">订单金额</span>
                  <span className="text-[11px] text-gray-500">¥{(data.orderAmount ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 font-medium">预计总分佣</span>
                  <span className="text-[12px] font-bold" style={{ color: '#FF6900' }}>¥{(data.totalCny ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">未分配（留存）</span>
                  <span className="text-[11px] text-gray-400">¥{(data.unallocatedCny ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 订单管理 ─────────────────────────────────────────────────────────────────
const ORDER_STATUS_OPTIONS = [
  { value: "pending",    label: "待处理" },
  { value: "confirmed",  label: "已确认" },
  { value: "packing",    label: "打包中" },
  { value: "shipped",    label: "已发货" },
  { value: "delivered",  label: "已送达" },
  { value: "cancelled",  label: "已取消" },
];
const STATUS_COLORS: Record<string, string> = {
  pending:    "text-amber-600 bg-amber-50",
  confirmed:  "text-blue-600 bg-blue-50",
  packing:    "text-purple-600 bg-purple-50",
  shipped:    "text-green-600 bg-green-50",
  delivered:  "text-gray-500 bg-gray-100",
  cancelled:  "text-red-500 bg-red-50",
};
const COURIER_OPTIONS = [
  '顺丰速运', '中通快递', '圆通速递', '韵达快递', '申通快递',
  '极兔速递', '京东快递', '邮政EMS', '德邦快递', '丰网速运', '其他',
];

function OrdersPanel() {
  const { data: orders, isLoading, refetch } = mtrpc.order.allOrders.useQuery();
  const updateMutation = mtrpc.order.updateStatus.useMutation({
    onSuccess: () => { toast.success("状态已更新"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelMutation = mtrpc.order.adminCancel.useMutation({
    onSuccess: (res: any) => {
      const parts = [];
      if (res.refundCny > 0.001) parts.push(`¥${res.refundCny.toFixed(2)} CNY`);
      if (res.refundUsdt > 0.000001) parts.push(`${res.refundUsdt.toFixed(4)} USDT`);
      toast.success(parts.length ? `已取消并退款 ${parts.join(' + ')}` : '已取消（无退款）');
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = mtrpc.order.adminDelete.useMutation({
    onSuccess: () => { toast.success('订单已删除（不退款）'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [trackingInputs, setTrackingInputs] = useState<Record<number, string>>({});
  const [courierInputs, setCourierInputs] = useState<Record<number, string>>({});
  const [adminNoteInputs, setAdminNoteInputs] = useState<Record<number, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'delete'; orderId: number; orderNo: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  // 批量操作
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  // 导出CSV
  const utils = mtrpc.useUtils();
  async function handleExport() {
    setExportLoading(true);
    try {
      const result = await utils.order.exportOrders.fetch({
        status: filterStatus === 'all' ? undefined : filterStatus,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        keyword: searchText.trim() || undefined,
      });
      if (!result?.csv) { toast.error('暂无可导出数据'); return; }
      const bom = '\uFEFF';
      const blob = new Blob([bom + result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `米伴订单_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${result.count} 笔订单`);
    } catch(e: any) {
      toast.error(e.message ?? '导出失败');
    } finally {
      setExportLoading(false);
    }
  }

  // 保存管理员备注
  function saveAdminNote(orderId: number, currentNote: string) {
    const note = adminNoteInputs[orderId] ?? currentNote ?? '';
    updateMutation.mutate({ id: orderId, status: orders?.find((o:any)=>o.id===orderId)?.status ?? 'pending', adminNote: note }, {
      onSuccess: () => { setEditingNoteId(null); toast.success('备注已保存'); refetch(); },
    });
  }
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o: any) => o.id)));
    }
  }
  async function executeBatch(type: 'cancel' | 'delete') {
    const ids = Array.from(selectedIds);
    setBatchProgress({ done: 0, total: ids.length });
    let done = 0;
    for (const id of ids) {
      try {
        if (type === 'cancel') {
          await cancelMutation.mutateAsync({ id });
        } else {
          await deleteMutation.mutateAsync({ id });
        }
      } catch (e: any) {
        toast.error(`#${id} 操作失败: ${e?.message ?? ''}`);
      }
      done++;
      setBatchProgress({ done, total: ids.length });
    }
    setBatchProgress(null);
    setBatchConfirm(null);
    setBatchMode(false);
    setSelectedIds(new Set());
    refetch();
    toast.success(type === 'cancel' ? `已批量取消 ${done} 笔订单` : `已批量删除 ${done} 笔订单`);
  }

  if (isLoading) return (
    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
  );

  if (!orders?.length) return (
    <div className="text-center py-16 text-gray-300 text-[13px]">暂无订单</div>
  );

  // 统计数据
  const total = orders.length;
  const countPending   = orders.filter((o: any) => o.status === 'pending').length;
  const countConfirmed = orders.filter((o: any) => o.status === 'confirmed').length;
  const countPacking   = orders.filter((o: any) => o.status === 'packing').length;
  const countShipped   = orders.filter((o: any) => o.status === 'shipped').length;
  const countDelivered = orders.filter((o: any) => o.status === 'delivered').length;
  const countCancelled = orders.filter((o: any) => o.status === 'cancelled').length;
  const totalRevenue   = orders
    .filter((o: any) => o.status !== 'cancelled')
    .reduce((s: number, o: any) => s + Number(o.totalPrice ?? 0), 0);

  const stats = [
    { key: 'all',       label: '全部',   count: total,          color: '#FF6900', bg: '#fff5ee' },
    { key: 'pending',   label: '待处理', count: countPending,   color: '#FF6900', bg: '#fff5ee' },
    { key: 'confirmed', label: '已确认', count: countConfirmed, color: '#FF6900', bg: '#fff5ee' },
    { key: 'packing',   label: '打包中', count: countPacking,   color: '#FF6900', bg: '#fff5ee' },
    { key: 'shipped',   label: '已发货', count: countShipped,   color: '#FF6900', bg: '#fff5ee' },
    { key: 'delivered', label: '已送达', count: countDelivered, color: '#6b7280', bg: '#f5f5f5' },
    { key: 'cancelled', label: '已取消', count: countCancelled, color: '#6b7280', bg: '#f5f5f5' },
  ];

  const baseOrders = filterStatus === 'all'
    ? (orders ?? [])
    : (orders ?? []).filter((o: any) => o.status === filterStatus);

  // 日期筛选
  let dateFilteredOrders = baseOrders;
  if (filterStartDate) {
    dateFilteredOrders = dateFilteredOrders.filter((o: any) => {
      const d = new Date(o.createdAt);
      return d >= new Date(filterStartDate + 'T00:00:00');
    });
  }
  if (filterEndDate) {
    dateFilteredOrders = dateFilteredOrders.filter((o: any) => {
      const d = new Date(o.createdAt);
      return d <= new Date(filterEndDate + 'T23:59:59');
    });
  }

  const filteredOrders = searchText.trim() === ''
    ? dateFilteredOrders
    : dateFilteredOrders.filter((o: any) => {
        const kw = searchText.trim().toLowerCase();
        return (
          String(o.id).includes(kw) ||
          (o.orderNo ?? '').toLowerCase().includes(kw) ||
          (o.recipeName ?? '').toLowerCase().includes(kw) ||
          (o.receiverName ?? '').toLowerCase().includes(kw) ||
          (o.receiverPhone ?? '').toLowerCase().includes(kw) ||
          (o.receiverAddress ?? '').toLowerCase().includes(kw) ||
          (o.trackingNo ?? '').toLowerCase().includes(kw) ||
          (o.userNote ?? '').toLowerCase().includes(kw) ||
          (o.adminNote ?? '').toLowerCase().includes(kw)
        );
      });

  const hasAdvFilter = !!(filterStartDate || filterEndDate);

  return (
    <div className="space-y-2">
      {/* 统计栏 - 紧凑单行 */}
      <div className="bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
        {/* 总金额小行 */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400">总金额（不含取消）</span>
          <span className="text-[13px] font-bold" style={{ color: '#FF6900' }}>¥{totalRevenue.toFixed(2)}</span>
        </div>
        {/* 状态按鈕单行横排 */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {stats.map(s => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(s.key)}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-center transition-all"
              style={{
                background: filterStatus === s.key ? s.color : s.bg,
                border: `1px solid ${filterStatus === s.key ? s.color : 'transparent'}`,
                minWidth: '44px',
              }}
            >
              <p className="text-[13px] font-bold leading-tight" style={{ color: filterStatus === s.key ? '#fff' : s.color }}>{s.count}</p>
              <p className="text-[9px]" style={{ color: filterStatus === s.key ? 'rgba(255,255,255,0.85)' : '#9ca3af' }}>{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 搜索框 + 高级筛选 + 导出 + 批量 */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索收件人、手机号、地址、单号…"
            className="w-full pl-8 pr-8 py-2.5 text-[13px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-300"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* 高级筛选按鈕 */}
        <button
          onClick={() => setShowAdvFilter(v => !v)}
          className="flex-shrink-0 p-2.5 rounded-xl border transition-colors"
          style={{
            background: hasAdvFilter ? '#FF6900' : '#fff',
            color: hasAdvFilter ? '#fff' : '#6b7280',
            borderColor: hasAdvFilter ? '#FF6900' : '#e5e7eb',
          }}
          title="高级筛选"
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
        {/* 导出按鈕 */}
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="flex-shrink-0 p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors"
          title="导出 CSV"
        >
          {exportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { setBatchMode(v => !v); setSelectedIds(new Set()); }}
          className="flex-shrink-0 text-[12px] font-medium px-3 py-2.5 rounded-xl border transition-colors"
          style={{
            background: batchMode ? '#FF6900' : '#fff',
            color: batchMode ? '#fff' : '#FF6900',
            borderColor: '#FF6900',
          }}
        >
          {batchMode ? '退出' : '批量'}
        </button>
      </div>
      {/* 高级筛选展开面板 */}
      {showAdvFilter && (
        <div className="bg-white rounded-xl border border-orange-100 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium text-gray-600 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />日期筛选</span>
            {hasAdvFilter && (
              <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[11px] text-orange-400 flex items-center gap-0.5">
                <RotateCcw className="w-3 h-3" />清除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-300"
            />
            <span className="text-[11px] text-gray-400">至</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-300"
            />
          </div>
          {hasAdvFilter && (
            <p className="text-[11px] text-orange-500">当前筛选显示 {filteredOrders.length} 笔订单，点导出可下载该时间段数据</p>
          )}
        </div>
      )}
      {/* 批量模式：全选栏 */}
      {batchMode && (
        <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-[12px] text-orange-600 font-medium">
            {selectedIds.size === filteredOrders.length && filteredOrders.length > 0
              ? <CheckSquare className="w-4 h-4" />
              : <Square className="w-4 h-4" />
            }
            {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? '取消全选' : `全选（${filteredOrders.length}）`}
          </button>
          <span className="text-[11px] text-orange-400">已选 {selectedIds.size} 笔</span>
        </div>
      )}

      {/* 订单列表 */}
      {filteredOrders.length === 0 && (
        <div className="text-center py-10 text-gray-300 text-[13px]">该状态暂无订单</div>
      )}
      {filteredOrders.map((order: any) => {
        const ingredients: any[] = (() => { try { return JSON.parse(order.ingredients ?? "[]"); } catch { return []; } })();
        const statusColor = STATUS_COLORS[order.status] ?? "text-gray-500 bg-gray-100";
        const isSelected = selectedIds.has(order.id);
        return (
          <div
            key={order.id}
            className="bg-white border rounded-2xl p-4 shadow-sm overflow-hidden transition-all"
            style={{ borderColor: batchMode && isSelected ? '#FF6900' : '#f3f4f6', borderWidth: batchMode && isSelected ? 1.5 : 1 }}
            onClick={batchMode ? () => toggleSelect(order.id) : undefined}
          >
            {/* 批量模式复选框行 */}
            {batchMode && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-50">
                {isSelected
                  ? <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#FF6900' }} />
                  : <Square className="w-4 h-4 flex-shrink-0 text-gray-300" />
                }
                <span className="text-[11px] text-gray-400">#{order.id} · {order.orderNo}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold text-black">{order.recipeName || "定制米"}</h3>
                <p className="text-[11px] text-gray-400">#{order.id} · {order.receiverName} · {order.receiverPhone}</p>
                <p className="text-[11px] text-gray-400 truncate">{order.receiverAddress}</p>
              </div>
              <select
                value={order.status}
                onChange={(e) => updateMutation.mutate({ id: order.id, status: e.target.value as any })}
                className={`text-[11px] border-0 rounded-full px-2.5 py-1 font-medium flex-shrink-0 focus:outline-none ${statusColor}`}
              >
                {ORDER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {ingredients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ingredients.map((ing: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-[11px] bg-gray-50 px-2 py-0.5 rounded-full text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                    {ing.name} {ing.weightJin?.toFixed(1)}斤
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold" style={{ color: "#FF6900" }}>¥{Number(order.totalPrice).toFixed(2)}</span>
              <span className="text-[11px] text-gray-400">· {order.totalWeightJin}斤</span>
            </div>
            {order.status === "confirmed" && (
              <div className="mt-2 space-y-1.5">
                {/* 快递公司下拉 */}
                <select
                  value={courierInputs[order.id] ?? ''}
                  onChange={e => setCourierInputs(p => ({ ...p, [order.id]: e.target.value }))}
                  className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-orange-300 text-gray-600"
                >
                  <option value="">选择快递公司（可选）</option>
                  {COURIER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {/* 单号输入 + 发货按鈕 */}
                <div className="flex items-center gap-2">
                  <input
                    value={trackingInputs[order.id] ?? ""}
                    onChange={(e) => setTrackingInputs(p => ({ ...p, [order.id]: e.target.value }))}
                    placeholder="填写快递单号（可选）"
                    className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  />
                  <button
                    onClick={() => updateMutation.mutate({
                      id: order.id,
                      status: "shipped",
                      trackingNo: trackingInputs[order.id],
                      trackingCompany: courierInputs[order.id] || undefined,
                    })}
                    className="text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 text-white flex-shrink-0"
                    style={{ background: "#FF6900" }}
                  >
                    <Truck className="w-3 h-3" />发货
                  </button>
                </div>
              </div>
            )}
            {/* 已发货时显示快递公司 */}
            {order.status === "shipped" && order.trackingCompany && (
              <p className="text-[11px] text-gray-400 mt-1">
                <Truck className="w-3 h-3 inline mr-1" />{order.trackingCompany} · {order.trackingNo || '未填单号'}
              </p>
            )}
            {/* 管理员备注区域 */}
            <div className="mt-2 pt-2 border-t border-gray-50">
              {editingNoteId === order.id ? (
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 flex-shrink-0 text-orange-400" />
                  <input
                    autoFocus
                    value={adminNoteInputs[order.id] ?? (order.adminNote ?? '')}
                    onChange={e => setAdminNoteInputs(p => ({ ...p, [order.id]: e.target.value }))}
                    placeholder="备注内容（仅管理员可见）"
                    className="flex-1 text-[11px] border border-orange-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                  />
                  <button onClick={() => saveAdminNote(order.id, order.adminNote ?? '')} className="p-1 rounded-lg bg-orange-500 text-white flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingNoteId(null)} className="p-1 rounded-lg border border-gray-200 text-gray-400 flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingNoteId(order.id); setAdminNoteInputs(p => ({ ...p, [order.id]: order.adminNote ?? '' })); }}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-orange-500 transition-colors"
                >
                  <MessageSquare className="w-3 h-3" />
                  {order.adminNote ? (
                    <span className="text-gray-600">{order.adminNote}</span>
                  ) : (
                    <span>添加备注</span>
                  )}
                  <Edit3 className="w-2.5 h-2.5 ml-auto opacity-50" />
                </button>
              )}
            </div>
            <CommissionPreviewBadge orderId={order.id} />
            {/* 取消 / 删除 按鈕（批量模式下隐藏） */}
            {!batchMode && order.status !== 'delivered' && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                {order.status !== 'cancelled' && (
                  <button
                    onClick={() => setConfirmAction({ type: 'cancel', orderId: order.id, orderNo: order.orderNo })}
                    className="flex-1 text-[11px] py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors"
                  >
                    取消订单（退款）
                  </button>
                )}
                <button
                  onClick={() => setConfirmAction({ type: 'delete', orderId: order.id, orderNo: order.orderNo })}
                  className="flex-1 text-[11px] py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors"
                >
                  删除订单（不退）
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 批量操作底部浮动栏 */}
      {batchMode && selectedIds.size > 0 && !batchConfirm && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-3 flex gap-2">
            <button
              onClick={() => setBatchConfirm('cancel')}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-orange-200 text-orange-500 hover:bg-orange-50 transition-colors"
            >
              批量取消（退款）
            </button>
            <button
              onClick={() => setBatchConfirm('delete')}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />批量删除
            </button>
          </div>
        </div>
      )}
      {/* 批量确认弹窗 */}
      {batchConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white w-full max-w-sm rounded-t-2xl p-5 pb-8">
            {batchProgress ? (
              <div className="text-center py-4">
                <p className="text-[15px] font-bold mb-2">处理中…</p>
                <p className="text-[13px] text-gray-500">{batchProgress.done} / {batchProgress.total}</p>
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round(batchProgress.done / batchProgress.total * 100)}%`, background: '#FF6900' }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-[15px] font-bold text-center mb-1">
                  {batchConfirm === 'cancel' ? '批量取消订单' : '批量删除订单'}
                </p>
                <p className="text-[12px] text-gray-500 text-center mb-4">
                  {batchConfirm === 'cancel'
                    ? `确认取消选中的 ${selectedIds.size} 笔订单？钱包金额将原路退回。`
                    : `确认删除选中的 ${selectedIds.size} 笔订单？此操作不退款且不可恢复。`
                  }
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setBatchConfirm(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-500"
                  >再想想</button>
                  <button
                    onClick={() => executeBatch(batchConfirm)}
                    className="flex-1 py-2.5 rounded-xl text-[13px] text-white font-medium"
                    style={{ background: batchConfirm === 'cancel' ? '#FF6900' : '#ef4444' }}
                  >
                    {batchConfirm === 'cancel' ? `确认取消 ${selectedIds.size} 笔` : `确认删除 ${selectedIds.size} 笔`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* 确认弹窗 */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white w-full max-w-sm rounded-t-2xl p-5 pb-8">
            <p className="text-[15px] font-bold text-center mb-1">
              {confirmAction.type === 'cancel' ? '取消订单' : '删除订单'}
            </p>
            <p className="text-[12px] text-gray-500 text-center mb-4">
              {confirmAction.type === 'cancel'
                ? `确认取消 #${confirmAction.orderNo}？钱包金额将原路退回。`
                : `确认删除 #${confirmAction.orderNo}？此操作不退款且不可恢复。`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-500"
              >再想想</button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'cancel') {
                    cancelMutation.mutate({ id: confirmAction.orderId });
                  } else {
                    deleteMutation.mutate({ id: confirmAction.orderId });
                  }
                  setConfirmAction(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-[13px] text-white font-medium"
                style={{ background: confirmAction.type === 'cancel' ? '#FF6900' : '#ef4444' }}
              >
                {confirmAction.type === 'cancel' ? '确认取消' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 米库管理 ─────────────────────────────────────────────────────────────────
const RICE_CATEGORIES = ['粳米', '籼米', '糯米', '特种米', '杂粮'];

function CatalogPanel() {
  const { data: catalog, isLoading, refetch } = mtrpc.rice.catalogList.useQuery({ onlyActive: false });
  // 查询本店米库，用于判断已入库状态
  const { data: storeList } = mtrpc.rice.adminList.useQuery();
  const upsertMutation = mtrpc.rice.catalogUpsert.useMutation({
    onSuccess: () => { toast.success('已保存'); refetch(); setShowForm(false); setFormData(emptyForm()); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = mtrpc.rice.catalogDelete.useMutation({
    onSuccess: () => { toast.success('已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const uploadImgMutation = mtrpc.rice.catalogUploadImg.useMutation({
    onSuccess: () => { toast.success('图片已上传'); refetch(); },
  });
  const batchUpdateMutation = mtrpc.rice.catalogBatchUpdate.useMutation({
    onSuccess: (data) => { toast.success(`已批量更新 ${data.count} 条`); refetch(); setBatchMode(false); setBatchEdits({}); },
    onError: (e: any) => toast.error(e.message),
  });

  const sortMutation = mtrpc.rice.catalogUpsert.useMutation({
    onSuccess: () => refetch(),
  });
  const toggleActiveMutation = mtrpc.rice.catalogUpsert.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  type CatalogForm = {
    id?: number;
    stdName: string; category: string; subCategory: string;
    origin: string; gbStandard: string; colorHex: string;
    description: string; sortOrder: number;
    // 营养字段
    calories: string; protein: string; carbs: string; fat: string; fiber: string;
    // 标签（逗号分隔的字符串）
    tagsInput: string;
    // 价格
    pricePerJin: string;
    // 总拨出率
    totalPayoutRate: string;
  };
  const emptyForm = (): CatalogForm => ({
    id: undefined, stdName: '', category: '粳米', subCategory: '', origin: '',
    gbStandard: '', colorHex: '#C8A87A', description: '', sortOrder: 0,
    calories: '', protein: '', carbs: '', fat: '', fiber: '', tagsInput: '',
    pricePerJin: '', totalPayoutRate: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CatalogForm>(emptyForm());
  const [filterCat, setFilterCat] = useState<string>('全部');
  const [search, setSearch] = useState('');
  // 批量编辑模式
  const [batchMode, setBatchMode] = useState(false);
  const [batchField, setBatchField] = useState<'pricePerJin' | 'origin' | 'category' | 'totalPayoutRate' | 'stockJin'>('pricePerJin');
  const [batchEdits, setBatchEdits] = useState<Record<number, string>>({});

  function enterBatchMode(field: typeof batchField) {
    setBatchField(field);
    const init: Record<number, string> = {};
    (catalog ?? []).forEach((c: any) => {
      if (field === 'pricePerJin') init[c.id] = c.pricePerJin != null ? String(c.pricePerJin) : '';
      else if (field === 'origin') init[c.id] = c.origin ?? '';
      else if (field === 'category') init[c.id] = c.category ?? '';
      else if (field === 'totalPayoutRate') init[c.id] = c.totalPayoutRate != null ? String(Math.round(Number(c.totalPayoutRate) * 100)) : '';
      else if (field === 'stockJin') init[c.id] = c.stockJin != null ? String(c.stockJin) : '';
    });
    setBatchEdits(init);
    setBatchMode(true);
    setShowForm(false);
  }

  function saveBatch() {
    const items = Object.entries(batchEdits)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([id, value]) => ({ id: Number(id), value: String(value) }));
    if (items.length === 0) { toast('没有需要保存的修改'); return; }
    batchUpdateMutation.mutate({ field: batchField as any, items });
  }


  // 已入库 catalogId 集合
  const inStoreCatalogIds = new Set<number>(
    (storeList ?? []).map((r: any) => r.catalogId).filter(Boolean)
  );

  function handleImgUpload(id: number, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      uploadImgMutation.mutate({ id, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function openEdit(item: any) {
    const n = item.nutritionJson ?? {};
    const tags: string[] = Array.isArray(item.tagsJson) ? item.tagsJson : [];
    setFormData({
      id: item.id, stdName: item.stdName, category: item.category,
      subCategory: item.subCategory ?? '', origin: item.origin ?? '',
      gbStandard: item.gbStandard ?? '', colorHex: item.colorHex ?? '#C8A87A',
      description: item.description ?? '', sortOrder: item.sortOrder ?? 0,
      calories: n.calories != null ? String(n.calories) : '',
      protein: n.protein != null ? String(n.protein) : '',
      carbs: n.carbs != null ? String(n.carbs) : '',
      fat: n.fat != null ? String(n.fat) : '',
      fiber: n.fiber != null ? String(n.fiber) : '',
      tagsInput: tags.join('，'),
      pricePerJin: item.pricePerJin != null ? String(item.pricePerJin) : '',
      totalPayoutRate: item.totalPayoutRate != null ? String(Math.round(Number(item.totalPayoutRate) * 100)) : '',
    });
    setShowForm(true);
  }

  function handleSave() {
    const nutritionJson = (formData.calories || formData.protein || formData.carbs || formData.fat || formData.fiber)
      ? {
          calories: formData.calories ? parseFloat(formData.calories) : undefined,
          protein: formData.protein ? parseFloat(formData.protein) : undefined,
          carbs: formData.carbs ? parseFloat(formData.carbs) : undefined,
          fat: formData.fat ? parseFloat(formData.fat) : undefined,
          fiber: formData.fiber ? parseFloat(formData.fiber) : undefined,
        }
      : undefined;
    const tagsJson = formData.tagsInput
      ? formData.tagsInput.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean)
      : undefined;
    upsertMutation.mutate({
      id: formData.id, stdName: formData.stdName, category: formData.category,
      subCategory: formData.subCategory || undefined, origin: formData.origin || undefined,
      gbStandard: formData.gbStandard || undefined, colorHex: formData.colorHex,
      description: formData.description || undefined, sortOrder: formData.sortOrder,
      nutritionJson, tagsJson,
      pricePerJin: formData.pricePerJin ? parseFloat(formData.pricePerJin) : undefined,
      totalPayoutRate: formData.totalPayoutRate ? parseFloat(formData.totalPayoutRate) / 100 : undefined,
    });
  }

  function handleSort(item: any, dir: 'up' | 'down') {
    const list = [...(filtered)];
    const idx = list.findIndex((c: any) => c.id === item.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const swapItem = list[swapIdx];
    sortMutation.mutate({ id: item.id, stdName: item.stdName, category: item.category, sortOrder: swapItem.sortOrder ?? swapIdx });
    sortMutation.mutate({ id: swapItem.id, stdName: swapItem.stdName, category: swapItem.category, sortOrder: item.sortOrder ?? idx });
  }

  const filtered = (catalog ?? []).filter((c: any) => {
    const matchCat = filterCat === '全部' || c.category === filterCat;
    const q = search.trim();
    const matchSearch = !q || c.stdName.includes(q) || (c.origin ?? '').includes(q) || (c.gbStandard ?? '').includes(q);
    return matchCat && matchSearch;
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  return (
    <div>
      {/* 分类筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
        {['全部', ...RICE_CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors ${
              filterCat === cat ? 'text-white' : 'bg-gray-100 text-gray-500'
            }`}
            style={filterCat === cat ? { background: '#FF6900' } : {}}>
            {cat}
          </button>
        ))}
      </div>
      {/* 搜索框 */}
      <div className="relative mb-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索名称、产地、国标编号..."
          className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-orange-300"
        />
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-gray-400">仓库共 {filtered.length} 种</span>
        <div className="flex items-center gap-2">
          {!batchMode ? (
            <>
              <div className="relative">
                <select
                  onChange={e => { if (e.target.value) enterBatchMode(e.target.value as any); e.target.value = ''; }}
                  defaultValue=""
                  className="text-[11px] pl-2 pr-6 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="" disabled>批量编辑</option>
                  <option value="pricePerJin">批量改价格</option>
                  <option value="origin">批量改产地</option>
                  <option value="category">批量改分类</option>
                  <option value="totalPayoutRate">批量改拨出率</option>
                  <option value="stockJin">批量改库存</option>
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
              </div>
              <button onClick={() => { setFormData(emptyForm()); setShowForm(true); }}
                className="text-[12px] px-3 py-1.5 rounded-xl text-white font-semibold active:scale-95"
                style={{ background: '#FF6900' }}>+ 新增</button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-orange-500 font-medium">批量改{batchField === 'pricePerJin' ? '价格' : batchField === 'origin' ? '产地' : batchField === 'category' ? '分类' : batchField === 'totalPayoutRate' ? '拨出率' : '库存'}</span>
                <button onClick={saveBatch} disabled={batchUpdateMutation.isPending}
                  className="text-[12px] px-3 py-1.5 rounded-xl text-white font-semibold active:scale-95 flex items-center gap-1"
                  style={{ background: '#FF6900' }}>
                  {batchUpdateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  保存
                </button>
                <button onClick={() => { setBatchMode(false); setBatchEdits({}); }}
                  className="text-[12px] px-3 py-1.5 rounded-xl text-gray-500 bg-gray-100 font-semibold active:scale-95">
                  取消
                </button>
              </div>
              {/* 统一设为同一个值 */}
              <div className="flex items-center gap-2">
                {batchField === 'category' ? (
                  <select
                    onChange={e => { const v = e.target.value; if (v) setBatchEdits(prev => { const next = { ...prev }; Object.keys(next).forEach(k => { next[Number(k)] = v; }); return next; }); }}
                    defaultValue=""
                    className="flex-1 text-[12px] border border-orange-200 rounded-xl px-3 py-1.5 bg-orange-50 focus:outline-none"
                  >
                    <option value="" disabled>统一设为分类...</option>
                    {RICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input
                    type={batchField === 'pricePerJin' || batchField === 'totalPayoutRate' ? 'number' : 'text'}
                    placeholder={batchField === 'pricePerJin' ? '统一设为价格（元/斤）' : batchField === 'totalPayoutRate' ? '统一设为拨出率 %' : batchField === 'stockJin' ? '统一设为库存（斤）' : '统一设为产地'}
                    className="flex-1 text-[12px] border border-orange-200 rounded-xl px-3 py-1.5 bg-orange-50 focus:outline-none"
                    onBlur={e => { const v = e.target.value; if (!v) return; setBatchEdits(prev => { const next = { ...prev }; Object.keys(next).forEach(k => { next[Number(k)] = v; }); return next; }); e.target.value = ''; }}
                    onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (!v) return; setBatchEdits(prev => { const next = { ...prev }; Object.keys(next).forEach(k => { next[Number(k)] = v; }); return next; }); (e.target as HTMLInputElement).value = ''; } }}
                  />
                )}
                <span className="text-[11px] text-gray-400 flex-shrink-0">回车应用全部</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* 编辑表单 */}
      {showForm && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4 space-y-3">
          <h3 className="text-[13px] font-bold">{formData.id ? '编辑仓库条目' : '新增标准米种'}</h3>
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11px] text-gray-500">标准名称 *</label>
              <input value={formData.stdName} onChange={e => setFormData(p => ({ ...p, stdName: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="如：五常大米" /></div>
            <div><label className="text-[11px] text-gray-500">大类 *</label>
              <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
                {RICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="text-[11px] text-gray-500">小类</label>
              <input value={formData.subCategory} onChange={e => setFormData(p => ({ ...p, subCategory: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="地理标志粣米" /></div>
            <div><label className="text-[11px] text-gray-500">主要产地</label>
              <input value={formData.origin} onChange={e => setFormData(p => ({ ...p, origin: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="五常/盘锦" /></div>
            <div><label className="text-[11px] text-gray-500">国标编号</label>
              <input value={formData.gbStandard} onChange={e => setFormData(p => ({ ...p, gbStandard: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="GB/T 1354" /></div>
            <div><label className="text-[11px] text-gray-500">代表色</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
                <input value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
              </div></div>
          </div>
          <div><label className="text-[11px] text-gray-500">简介</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none resize-none" /></div>
          {/* 营养数据 */}
          <div>
            <label className="text-[11px] text-gray-500 font-medium">营养数据（每100g）</label>
            <div className="grid grid-cols-5 gap-2 mt-1">
              {([['calories','热量 kcal'],['protein','蛋白质 g'],['carbs','碳水 g'],['fat','脂肪 g'],['fiber','膣食纤 g']] as const).map(([k, label]) => (
                <div key={k}>
                  <div className="text-[9px] text-gray-400 mb-0.5">{label}</div>
                  <input type="number" value={(formData as any)[k]} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))}
                    className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" placeholder="-" />
                </div>
              ))}
            </div>
          </div>
          {/* 标签 */}
          <div>
            <label className="text-[11px] text-gray-500 font-medium">标签（逗号分隔）</label>
            <input value={formData.tagsInput} onChange={e => setFormData(p => ({ ...p, tagsInput: e.target.value }))}
              className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
              placeholder="如：低糖，高蛋白，药食同源" />
          </div>
          {/* 价格 */}
          <div>
            <label className="text-[11px] text-gray-500 font-medium">市场参考价（元/斤）</label>
            <input type="number" value={formData.pricePerJin} onChange={e => setFormData(p => ({ ...p, pricePerJin: e.target.value }))}
              className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
              placeholder="如：8.5" />
          </div>
          {/* 总拨出率 */}
          <div>
            <label className="text-[11px] text-gray-500 font-medium">总拨出率 %（分佣池子比例）</label>
            <input type="number" value={formData.totalPayoutRate} onChange={e => setFormData(p => ({ ...p, totalPayoutRate: e.target.value }))}
              className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
              placeholder="如：10（代表 10%）" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave}
              disabled={!formData.stdName || upsertMutation.isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: '#FF6900' }}>
              {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存'}
            </button>
            <button onClick={() => { setShowForm(false); setFormData(emptyForm()); }} className="px-5 py-2.5 rounded-xl text-[13px] text-gray-500 bg-gray-100">取消</button>
          </div>
        </div>
      )}
      {/* 列表 */}
      <div className="space-y-2">
        {filtered.map((item: any, idx: number) => {
          const hasNutrition = !!item.nutritionJson;
          const tags: string[] = Array.isArray(item.tagsJson) ? item.tagsJson : [];
          const isInStore = inStoreCatalogIds.has(item.id);
          return (
            <div key={item.id} className={`bg-white border rounded-2xl p-3 shadow-sm transition-opacity ${item.isActive ? 'border-gray-100' : 'border-gray-200 opacity-50'}`}>
              <div className="flex items-center gap-3">
                {/* 图片/色块 */}
                <label className="relative flex-shrink-0 cursor-pointer group">
                  {item.img
                    ? <img src={cosImg(item.img, 48)} alt={item.stdName} className="w-12 h-12 rounded-xl object-cover" />
                    : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: item.colorHex ?? '#C8A87A' }}>{item.stdName[0]}</div>
                  }
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-[9px]">换图</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImgUpload(item.id, f); }} />
                </label>
                {/* 主信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-bold text-black">{item.stdName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">{item.category}</span>
                    {!item.isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">已下架</span>}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      hasNutrition ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>{hasNutrition ? '营养' : '无营养'}</span>
                    {isInStore && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">已入库</span>}
                    {item.gbStandard && <span className="text-[10px] text-gray-400">{item.gbStandard}</span>}
                  </div>
                  {item.origin && <div className="text-[11px] text-gray-400">产地：{item.origin}</div>}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.slice(0, 4).map((t: string) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">{t}</span>
                      ))}
                      {tags.length > 4 && <span className="text-[9px] text-gray-400">+{tags.length - 4}</span>}
                    </div>
                  )}
                  {/* 批量编辑输入框 */}
                  {batchMode && (
                    <div className="mt-2">
                      {batchField === 'category' ? (
                        <select
                          value={batchEdits[item.id] ?? ''}
                          onChange={e => setBatchEdits(p => ({ ...p, [item.id]: e.target.value }))}
                          className="w-full text-[12px] border border-orange-300 rounded-lg px-2 py-1.5 bg-orange-50 focus:outline-none"
                        >
                          {RICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input
                          type={batchField === 'pricePerJin' || batchField === 'totalPayoutRate' || batchField === 'stockJin' ? 'number' : 'text'}
                          value={batchEdits[item.id] ?? ''}
                          onChange={e => setBatchEdits(p => ({ ...p, [item.id]: e.target.value }))}
                          placeholder={batchField === 'pricePerJin' ? '价格（元/斤）' : batchField === 'totalPayoutRate' ? '拨出率 %（如 10）' : batchField === 'stockJin' ? '库存（斤）' : '产地'}
                          className="w-full text-[12px] border border-orange-300 rounded-lg px-2 py-1.5 bg-orange-50 focus:outline-none"
                        />
                      )}
                    </div>
                  )}
                </div>
                {/* 操作按钮 */}
                {!batchMode && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(item)}
                      className="text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">编辑</button>
                    <button onClick={() => { if (confirm(`确认删除「${item.stdName}」？`)) deleteMutation.mutate({ id: item.id }); }}
                      className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-500 font-medium">删除</button>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: item.id, stdName: item.stdName, category: item.category, isActive: !item.isActive })}
                      disabled={toggleActiveMutation.isPending}
                      className={`text-[11px] px-2 py-1 rounded-lg font-medium transition-colors ${item.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                    >{item.isActive ? '上架' : '下架'}</button>
                    <div className="flex gap-0.5">
                      <button onClick={() => handleSort(item, 'up')} disabled={idx === 0}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 disabled:opacity-30">↑</button>
                      <button onClick={() => handleSort(item, 'down')} disabled={idx === filtered.length - 1}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 disabled:opacity-30">↓</button>
                    </div>
                  </div>
                )}
              </div>
              {/* 价格/拨出率/库存信息栏 */}
              {!batchMode && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {item.pricePerJin > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-orange-50 text-orange-600 font-medium">
                      售价 ¥{Number(item.pricePerJin).toFixed(2)}/斤
                    </span>
                  )}
                  {item.totalPayoutRate > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-green-50 text-green-600 font-medium">
                      拨出 {(Number(item.totalPayoutRate) * 100).toFixed(1)}%
                      {item.pricePerJin > 0 && (
                        <span className="text-green-500">（¥{(Number(item.pricePerJin) * Number(item.totalPayoutRate)).toFixed(2)}/斤）</span>
                      )}
                    </span>
                  )}
                  {item.stockJin !== undefined && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${
                      Number(item.stockJin) <= 0 ? 'bg-red-50 text-red-500' :
                      Number(item.stockJin) < 50 ? 'bg-yellow-50 text-yellow-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>
                      库存 {Number(item.stockJin).toFixed(1)}斤
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RicePanel() {
  return <CatalogPanel />;
}

// ─── 集散中心（占位架构）─────────────────────────────────────────────────────
const DISTRIBUTION_CENTERS = [
  { id: 1, name: "华东仓", location: "上海", status: "active" },
  { id: 2, name: "华南仓", location: "广州", status: "active" },
  { id: 3, name: "华北仓", location: "北京", status: "active" },
  { id: 4, name: "西南仓", location: "成都", status: "planned" },
  { id: 5, name: "华中仓", location: "武汉", status: "planned" },
];

function WarehousePanel() {
  return (
    <div className="space-y-3">
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-2">
        <p className="text-[12px] text-orange-600 font-medium">架构预留 · 功能开发中</p>
        <p className="text-[11px] text-orange-400 mt-1">集散中心库存管理系统正在建设，以下为规划节点</p>
      </div>
      {DISTRIBUTION_CENTERS.map((center) => (
        <div key={center.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: center.status === "active" ? "#FF6900" : "#E5E7EB" }}>
              <Warehouse className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-black">{center.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${center.status === "active" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  {center.status === "active" ? "运营中" : "规划中"}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{center.location}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] text-gray-400">库存</p>
              <p className="text-[16px] font-bold text-gray-300">—</p>
            </div>
          </div>
          {center.status === "active" && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50">
              <div className="text-center">
                <p className="text-[10px] text-gray-400">今日出库</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">本月订单</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">剩余库存</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 用户管理 ─────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  baby: "顾客",
  parent: "米商/经销商",
};
const ROLE_COLORS: Record<string, string> = {
  baby: "bg-gray-100 text-gray-500",
  parent: "bg-blue-50 text-blue-600",
};

// 米伴职级体系
const RANK_LEVELS = [
  { index: 1, name: "米农", color: "bg-gray-100 text-gray-500" },
  { index: 2, name: "米商", color: "bg-blue-50 text-blue-600" },
  { index: 3, name: "米行", color: "bg-purple-50 text-purple-600" },
  { index: 4, name: "米庄", color: "bg-orange-50 text-orange-600" },
  { index: 5, name: "米王", color: "bg-yellow-50 text-yellow-600" },
];
function getRankInfo(rankIndex: number) {
  return RANK_LEVELS.find(r => r.index === rankIndex) ?? RANK_LEVELS[0];
}

function UsersPanel() {
  const utils = mtrpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = mtrpc.adminUser.list.useQuery();
  const setRankMutation = mtrpc.adminUser.setRank.useMutation({
    onSuccess: () => { utils.adminUser.list.invalidate(); toast.success("职级已更新"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "usdtBalance" | "cnyBalance" | "orderCount" | "inviteCount">("createdAt");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const handleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const filtered = (users ?? [])
    .filter((u: any) => !search || (u.name ?? "").includes(search) || (u.username ?? "").includes(search))
    .sort((a: any, b: any) => {
      let av = 0, bv = 0;
      if (sortBy === "usdtBalance") { av = a.usdtBalance ?? parseFloat(a.balance ?? "0"); bv = b.usdtBalance ?? parseFloat(b.balance ?? "0"); }
      else if (sortBy === "cnyBalance") { av = a.cnyBalance ?? 0; bv = b.cnyBalance ?? 0; }
      else if (sortBy === "orderCount") { av = a.orderCount ?? 0; bv = b.orderCount ?? 0; }
      else if (sortBy === "inviteCount") { av = a.inviteCount ?? 0; bv = b.inviteCount ?? 0; }
      else { av = new Date(a.createdAt ?? 0).getTime(); bv = new Date(b.createdAt ?? 0).getTime(); }
      return sortDir === "desc" ? bv - av : av - bv;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          placeholder="搜索昵称或用户名…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-[13px] border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:border-orange-300"
        />
        <button
          onClick={() => setLocation("/admin/wallet-adjust?from=miban")}
          className="flex-shrink-0 text-[12px] font-medium px-3 py-2.5 rounded-xl bg-orange-50 text-orange-500 border border-orange-200 hover:bg-orange-100 transition-colors"
        >
          调账
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400">排序：</span>
        {([
          { key: "createdAt", label: "注册时间" },
          { key: "usdtBalance", label: "USDT" },
          { key: "cnyBalance", label: "人民币" },
          { key: "orderCount", label: "订单数" },
          { key: "inviteCount", label: "推荐数" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
              sortBy === key
                ? "border-orange-400 text-orange-500 bg-orange-50 font-medium"
                : "border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-400"
            }`}
          >
            {label}{sortBy === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-300">{filtered.length} 人</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-gray-300 text-[13px]">暂无用户</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u: any) => (
            <div key={u.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: "#FF6900" }}>
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-black truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-[11px] text-gray-400 truncate">@{u.username}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${getRankInfo(u.mibanRankIndex ?? 1).color}`}>
                  {getRankInfo(u.mibanRankIndex ?? 1).name}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">USDT</span>
                  <span className="text-[12px] font-bold text-orange-500">{(u.usdtBalance ?? parseFloat(u.balance ?? '0')).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">人民币</span>
                  <span className="text-[12px] font-bold text-green-600">¥{(u.cnyBalance ?? 0).toFixed(2)}</span>
                </div>
                <span className="text-[11px] text-gray-300 ml-auto">积分 {u.points ?? 0}</span>
              </div>
              {/* 职级设置（点击同步更新权限：米农=顾客，米商及以上=经销商） */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-gray-400">职级：</span>
                {RANK_LEVELS.map(rank => (
                  <button
                    key={rank.index}
                    disabled={(u.mibanRankIndex ?? 1) === rank.index || setRankMutation.isPending}
                    onClick={() => setRankMutation.mutate({ userId: u.id, rankIndex: rank.index })}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border transition-colors ${
                      (u.mibanRankIndex ?? 1) === rank.index
                        ? `${rank.color} border-transparent font-medium`
                        : "border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-500 cursor-pointer"
                    }`}
                  >
                    {rank.name}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-gray-300">
                  订单 {u.orderCount ?? 0} | 推荐 {u.inviteCount} 人
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 团队管理（佣金配置 + 制度 + 团队）─────────────────────────────────────────
function SalesPanel() {
  const utils = mtrpc.useUtils();
  // 佣金配置
  const { data: configs, isLoading } = mtrpc.adminCommission.configs.useQuery();
  const [showAgentStats, setShowAgentStats] = useState(false);
  const { data: agentStats } = mtrpc.adminCommission.agentStats.useQuery(undefined, { enabled: showAgentStats });
  const setConfigMutation = mtrpc.adminCommission.setConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("佣金配置已保存"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteConfigMutation = mtrpc.adminCommission.deleteConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("已删除"); },
    onError: (e: any) => toast.error(e.message),
  });
  // 销售制度
  const { data: plans = [], isLoading: plansLoading } = mtrpc.mibanTeam.listPlans.useQuery();
  const createPlanMut = mtrpc.mibanTeam.createPlan.useMutation({ onSuccess: () => { utils.mibanTeam.listPlans.invalidate(); toast.success("制度已创建"); } });
  const updatePlanMut = mtrpc.mibanTeam.updatePlan.useMutation({ onSuccess: () => { utils.mibanTeam.listPlans.invalidate(); toast.success("制度已更新"); setEditingPlanId(null); } });
  const deletePlanMut = mtrpc.mibanTeam.deletePlan.useMutation({ onSuccess: () => { utils.mibanTeam.listPlans.invalidate(); toast.success("制度已删除"); } });
  // 团队
  const { data: teams = [], isLoading: teamsLoading } = mtrpc.mibanTeam.listTeams.useQuery();
  const createTeamMut = mtrpc.mibanTeam.createTeam.useMutation({ onSuccess: () => { utils.mibanTeam.listTeams.invalidate(); toast.success("团队已创建"); } });
  const updateTeamMut = mtrpc.mibanTeam.updateTeam.useMutation({ onSuccess: () => { utils.mibanTeam.listTeams.invalidate(); toast.success("团队已更新"); setEditingTeamId(null); } });
  const deleteTeamMut = mtrpc.mibanTeam.deleteTeam.useMutation({ onSuccess: () => { utils.mibanTeam.listTeams.invalidate(); toast.success("团队已删除"); } });
  // 编辑团队
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState({ planId: "", multiplier: "100" });
  // 成员树
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const { data: teamMembersData, isLoading: membersLoading } = mtrpc.mibanTeam.getTeamMembers.useQuery(
    { teamId: selectedTeam! }, { enabled: !!selectedTeam }
  );
  const members = teamMembersData?.members ?? [];
  // 新建制度表单（无限级层级）
  const [newPlan, setNewPlan] = useState({ name: "", trigger: "order_confirmed", settlement: "manual" });
  const [planLevels, setPlanLevels] = useState<{ rate: string }[]>([{ rate: "50" }, { rate: "30" }]);
  // 编辑制度
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState({ name: "", trigger: "order_confirmed", settlement: "manual" });
  const [editPlanSalesRate, setEditPlanSalesRate] = useState<string>("30");
  const [editPlanLevels, setEditPlanLevels] = useState<{ rate: string }[]>([]);
  const [editPlanGenBonus, setEditPlanGenBonus] = useState<{ rate: string }[]>([]);
  const [editPlanRanks, setEditPlanRanks] = useState<{ name: string; bonusRate: string; unlockType: string; personalCumulativeMin: string; teamCumulativeMin: string }[]>([]);
  const [editPlanDividendRate, setEditPlanDividendRate] = useState<string>("");
  // 制度内展开的子面板：'sales' | 'levels' | 'genbonus' | 'dividend'
  const [planEditTab, setPlanEditTab] = useState<'sales' | 'levels' | 'genbonus' | 'dividend'>('sales');
  // 新建团队表单
  const [newTeam, setNewTeam] = useState({ name: "", rootUserId: "", rootUserName: "", planId: "", multiplier: "100" });
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showPlanGuide, setShowPlanGuide] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  // 搜索用户（全量加载，本地过滤）
  const [userSearch, setUserSearch] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const { data: allUsers = [] } = mtrpc.adminUser.list.useQuery(undefined, { enabled: showTeamForm });
  const searchResults = userSearch
    ? (allUsers as any[]).filter((u: any) =>
        (u.name ?? "").includes(userSearch) ||
        (u.username ?? "").includes(userSearch)
      ).slice(0, 30)
    : (allUsers as any[]).slice(0, 50);

  const [globalMultiplier, setGlobalMultiplier] = useState("");
  const [globalNote, setGlobalNote] = useState("");
  const [globalPlanId, setGlobalPlanId] = useState("");

  const globalConfig = configs?.find((c: any) => c.agentId === null);

  function saveGlobal() {
    if (!globalPlanId) { toast.error("请选择销售制度"); return; }
    const multiplier = globalMultiplier ? parseFloat(globalMultiplier) / 100 : 1.0;
    if (isNaN(multiplier) || multiplier < 0 || multiplier > 1) { toast.error("请输入0-100之间的百分比"); return; }
    setConfigMutation.mutate({ agentId: null, payoutRateMultiplier: multiplier, note: globalNote || undefined, planId: parseInt(globalPlanId) });
    setGlobalMultiplier(""); setGlobalNote(""); setGlobalPlanId("");
  }

  // 展开的团队详情（null=全局默认，数字=团队id）
  const [expandedCard, setExpandedCard] = useState<number | 'global' | null>(null);

  return (
    <>
    <div className="space-y-3">
      {/* ── 所有人员（全局默认）卡片 ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50"
          onClick={() => setExpandedCard(expandedCard === 'global' ? null : 'global')}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FF6900" }}>
            <span className="text-white text-[13px] font-bold">全</span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-black">所有人员</p>
            <p className="text-[11px] text-gray-400">未单独分配团队的默认配置</p>
          </div>
          <div className="text-right flex-shrink-0">
            {globalConfig && (
              <>
                <p className="text-[13px] font-bold" style={{ color: "#FF6900" }}>
                  {(Number((globalConfig as any).payoutRateMultiplier ?? 1) * 100).toFixed(0)}%
                </p>
                <p className="text-[11px] text-gray-400">拨出系数</p>
              </>
            )}
          </div>
          <span className="text-gray-300 text-[12px] ml-1">{expandedCard === 'global' ? '▲' : '▼'}</span>
        </div>
        {expandedCard === 'global' && (
          <div className="border-t border-gray-50 px-4 py-3 space-y-3 bg-gray-50/50">
            {/* 兜底配置：选制度 + 拨出系数 */}
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-gray-600">兜底配置</p>
              {globalConfig && (
                <div className="bg-white rounded-xl px-3 py-2 space-y-0.5">
                  <p className="text-[12px] font-medium text-black">当前制度：{globalConfig.planId ? (plans as any[]).find((p: any) => p.id === globalConfig.planId)?.name ?? `ID ${globalConfig.planId}` : '未配置'}</p>
                  <p className="text-[12px]" style={{ color: '#FF6900' }}>拨出系数：{(Number((globalConfig as any).payoutRateMultiplier ?? 1) * 100).toFixed(0)}%</p>
                  {globalConfig.note && <p className="text-[11px] text-gray-400">{globalConfig.note}</p>}
                </div>
              )}
              <select
                value={globalPlanId}
                onChange={e => setGlobalPlanId(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300"
              >
                <option value="">选择销售制度（必选）</option>
                {(plans as any[]).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input placeholder="拨出系数 % （不填则为100%）" value={globalMultiplier} onChange={e => setGlobalMultiplier(e.target.value)} className="flex-1 min-w-0 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
                <button onClick={saveGlobal} disabled={setConfigMutation.isPending} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 flex-shrink-0" style={{ background: "#FF6900" }}>保存</button>
              </div>
              <input placeholder="备注（选填）" value={globalNote} onChange={e => setGlobalNote(e.target.value)} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
            </div>

            {/* 已有配置 */}
            {configs && configs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400">已有配置</p>
                {configs.map((c: any) => {
                  const planName = c.planId ? (plans as any[]).find((p: any) => p.id === c.planId)?.name : null;
                  return (
                  <div key={c.id} className="bg-white rounded-xl px-3 py-2 flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-black">{c.agentId === null ? "兜底默认" : `业务员 ID: ${c.agentId}`}</p>
                      {planName && <p className="text-[11px] font-medium" style={{ color: '#FF6900' }}>制度：{planName}</p>}
                      {c.note && <p className="text-[11px] text-gray-400">{c.note}</p>}
                    </div>
                    <span className="text-[14px] font-bold" style={{ color: "#FF6900" }}>{(Number(c.payoutRateMultiplier ?? 1) * 100).toFixed(0)}%</span>
                    <button onClick={() => deleteConfigMutation.mutate({ id: c.id })} className="text-gray-300 hover:text-red-400 text-[12px] ml-1">删除</button>
                  </div>
                );})}
              </div>
            )}
            {/* 业务员业绩 */}
            <div>
              <button onClick={() => setShowAgentStats(v => !v)} className="text-[12px] text-orange-500 font-medium">
                {showAgentStats ? '收起业务员业绩' : '查看业务员业绩汇总'}
              </button>
              {showAgentStats && (
                <div className="mt-2 space-y-1.5">
                  {!agentStats ? <p className="text-[12px] text-gray-300">加载中...</p> : agentStats.length === 0 ? <p className="text-[12px] text-gray-300">暂无数据</p> : agentStats.map((a: any) => (
                    <div key={a.id} className="bg-white rounded-xl px-3 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-black truncate">{a.name ?? "匿名"}</p>
                        <p className="text-[11px] text-gray-400">推荐 {a.inviteCount} 人 · {a.orderCount} 单</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-bold" style={{ color: "#FF6900" }}>￥{Number(a.totalCommission).toFixed(2)}</p>
                        <p className="text-[10px] text-amber-500">待结 ￥{Number(a.pendingCommission).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 各团队卡片 ── */}
      {teamsLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : (
        teams.map((t: any) => (
          <div key={t.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50"
              onClick={() => setExpandedCard(expandedCard === t.id ? null : t.id)}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[13px] font-bold" style={{ background: "#FF6900" }}>
                {(t.name ?? '团').slice(0, 1)}
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-black">{t.name}</p>
                <p className="text-[11px] text-gray-400">根节点: {t.rootUserName} · {t.planName || "无制度"}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[13px] font-bold" style={{ color: "#FF6900" }}>{((t.payoutRateMultiplier ?? 1) * 100).toFixed(0)}%</p>
                <p className="text-[11px] text-gray-400">拨出系数</p>
              </div>
              <span className="text-gray-300 text-[12px] ml-1">{expandedCard === t.id ? '▲' : '▼'}</span>
            </div>
            {expandedCard === t.id && (
              <div className="border-t border-gray-50 px-4 py-3 space-y-3 bg-gray-50/50">
                {/* 团队基本信息 + 编辑 */}
                {editingTeamId === t.id ? (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-gray-600">编辑奖金制度</p>
                    <select value={editTeam.planId} onChange={e => setEditTeam(v => ({ ...v, planId: e.target.value }))} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
                      <option value="">无制度</option>
                      {(plans as any[]).map((p: any) => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="1000" placeholder="拨出系数" value={editTeam.multiplier} onChange={e => setEditTeam(v => ({ ...v, multiplier: e.target.value }))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
                      <span className="text-[12px] text-gray-400">% 拨出系数</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateTeamMut.mutate({ id: t.id, commissionPlanId: editTeam.planId ? Number(editTeam.planId) : null, payoutRateMultiplier: Number(editTeam.multiplier) / 100 })} disabled={updateTeamMut.isPending} className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#FF6900" }}>
                        {updateTeamMut.isPending ? "保存中..." : "保存"}
                      </button>
                      <button onClick={() => setEditingTeamId(null)} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 border border-gray-200">取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div><span className="text-gray-400">销售制度：</span><span className="font-medium">{t.planName || "无"}</span></div>
                    <div className="flex items-center gap-2"><span className="text-gray-400">拨出系数：</span><span className="font-medium">{((t.payoutRateMultiplier ?? 1) * 100).toFixed(0)}%</span>
                      <button onClick={() => { setEditingTeamId(t.id); setEditTeam({ planId: t.commissionPlanId ? String(t.commissionPlanId) : "", multiplier: String(Math.round((t.payoutRateMultiplier ?? 1) * 100)) }); }} className="text-[12px] text-orange-400 font-medium ml-auto">编辑</button>
                    </div>
                  </div>
                )}
                {/* 成员树 */}
                <div>
                  <button onClick={() => setSelectedTeam(selectedTeam === t.id ? null : t.id)} className="flex items-center gap-1.5 mb-2">
                    <p className="text-[12px] font-semibold text-gray-600">团队成员</p>
                    {selectedTeam === t.id && !membersLoading && members.length > 1 && (
                      <span className="text-[11px] text-orange-500 font-medium">（共 {members.length - 1} 人）</span>
                    )}
                    <span className="text-[12px] text-orange-400 ml-1">{selectedTeam === t.id ? '收起' : '查看'}</span>
                  </button>
                  {selectedTeam === t.id && (
                    <div className="mt-1 space-y-3">
                      {membersLoading ? <p className="text-[12px] text-gray-300">加载中...</p> : members.length === 0 ? (
                        <p className="text-[12px] text-gray-300">暂无成员</p>
                      ) : (() => {
                        // depth=1 是根节点（团长），单独展示；其下级 depth-1 即为层级编号
                        const root = members.find((m: any) => m.depth === 1);
                        const subMembers = members.filter((m: any) => m.depth > 1);
                        const maxDepth = subMembers.length ? Math.max(...subMembers.map((m: any) => m.depth)) : 1;
                        return (
                          <>
                            {root && (
                              <div className="flex items-center gap-2 py-0.5 mb-1">
                                <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[8px] font-bold text-gray-500">团</span>
                                </div>
                                <p className="text-[12px] text-gray-500 flex-1 truncate">{root.name || "匿名"} <span className="text-gray-400">@{root.username}</span> <span className="text-gray-300">（团长）</span></p>
                                {(root.orderCount > 0) && <span className="text-[10px] text-gray-400 flex-shrink-0">{root.orderCount}单</span>}
                              </div>
                            )}
                            {Array.from({ length: maxDepth - 1 }, (_, i) => i + 2).map(depth => {
                              const levelMembers = subMembers.filter((m: any) => m.depth === depth);
                              if (!levelMembers.length) return null;
                              const displayLevel = depth - 1;
                              return (
                                <div key={depth}>
                                  <p className="text-[11px] text-gray-400 font-medium mb-1">第 {displayLevel} 层 <span className="text-orange-400">{levelMembers.length} 人</span></p>
                                  <div className="space-y-0.5">
                                    {levelMembers.map((m: any) => (
                                      <div key={m.id} className="flex items-center gap-2 py-0.5">
                                        <div className="w-4 h-4 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                                          <span className="text-[8px] font-bold" style={{ color: "#FF6900" }}>{displayLevel}</span>
                                        </div>
                                        <p className="text-[12px] text-black flex-1 truncate">{m.name || "匿名"} <span className="text-gray-400">@{m.username}</span></p>
                                        {(m.orderCount > 0) && <span className="text-[10px] text-gray-400 flex-shrink-0">{m.orderCount}单</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                {/* 删除团队 */}
                <button onClick={() => { if(confirm('确认删除团队「' + t.name + '」？')) deleteTeamMut.mutate({ id: t.id }); }} className="text-[12px] text-gray-300 hover:text-red-400 transition-colors">删除此团队</button>
              </div>
            )}
          </div>
        ))
      )}

      {/* ── 销售制度卡片 ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50" onClick={() => setExpandedCard(expandedCard === -1 ? null : -1 as any)}>
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-gray-500 text-[13px] font-bold">制</span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-black">销售制度</p>
            <p className="text-[11px] text-gray-400">配置各团队的层级分佣规则 · <span className="text-orange-400 cursor-pointer" onClick={e => { e.stopPropagation(); setShowPlanGuide(true); }}>参考说明</span></p>
          </div>
          <span className="text-gray-300 text-[12px]">{expandedCard === -1 ? '▲' : '▼'}</span>
        </div>
        {expandedCard === (-1 as any) && (
          <div className="border-t border-gray-50 px-4 py-3 space-y-3 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-gray-600">已有制度</p>
              <button onClick={() => setShowPlanForm(v => !v)} className="text-[12px] text-orange-500 font-medium">{showPlanForm ? '收起' : '+ 新建制度'}</button>
            </div>
            {showPlanForm && (
              <div className="bg-white rounded-xl p-3 space-y-2 border border-gray-100">
                <input placeholder="制度名称" value={newPlan.name} onChange={e => setNewPlan(p => ({ ...p, name: e.target.value }))} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-500">层级佣金分配（占总拨出率的比例）</p>
                  {planLevels.map((lv, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400 w-10 flex-shrink-0">第{idx + 1}层</span>
                      <input type="number" min="0" max="100" placeholder="%" value={lv.rate} onChange={e => setPlanLevels(ls => ls.map((l, i) => i === idx ? { rate: e.target.value } : l))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none" />
                      <span className="text-[11px] text-gray-400">%</span>
                      {planLevels.length > 1 && <button onClick={() => setPlanLevels(ls => ls.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 text-[13px] w-5">✕</button>}
                    </div>
                  ))}
                  <button onClick={() => setPlanLevels(ls => [...ls, { rate: "" }])} className="text-[12px] text-orange-500">+ 添加层级</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={newPlan.trigger} onChange={e => setNewPlan(p => ({ ...p, trigger: e.target.value }))} className="text-[12px] border border-gray-200 rounded-xl px-2 py-1.5 bg-white">
                    <option value="order_placed">下单即触发</option>
                    <option value="order_confirmed">确认收货触发</option>
                  </select>
                  <select value={newPlan.settlement} onChange={e => setNewPlan(p => ({ ...p, settlement: e.target.value }))} className="text-[12px] border border-gray-200 rounded-xl px-2 py-1.5 bg-white">
                    <option value="manual">手动结算</option>
                    <option value="auto">自动到账</option>
                  </select>
                </div>
                <button onClick={() => {
                  const levels = planLevels.map((l, i) => ({ levelIndex: i + 1, rate: Number(l.rate) / 100 })).filter(l => l.rate > 0);
                  createPlanMut.mutate({ name: newPlan.name, triggerEvent: newPlan.trigger as any, settlement: newPlan.settlement as any, levels }, {
                    onSuccess: () => { setShowPlanForm(false); setPlanLevels([{ rate: "50" }, { rate: "30" }]); setNewPlan({ name: "", trigger: "order_confirmed", settlement: "manual" }); }
                  });
                }} disabled={!newPlan.name || createPlanMut.isPending} className="w-full py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#FF6900" }}>
                  {createPlanMut.isPending ? "创建中..." : "确认创建"}
                </button>
              </div>
            )}
            {plansLoading ? <p className="text-[12px] text-gray-300">加载中...</p> : plans.length === 0 ? (
              <p className="text-[12px] text-gray-300">暂无制度</p>
            ) : plans.map((p: any) => (
              <div key={p.id} className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
                {editingPlanId === p.id ? (
                  // 内联编辑表单
                  <div className="space-y-2">
                    <input placeholder="制度名称" value={editPlan.name} onChange={e => setEditPlan(v => ({ ...v, name: e.target.value }))} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={editPlan.trigger} onChange={e => setEditPlan(v => ({ ...v, trigger: e.target.value }))} className="text-[12px] border border-gray-200 rounded-xl px-2 py-1.5 bg-white">
                        <option value="order_placed">下单即触发</option>
                        <option value="order_confirmed">确认收货触发</option>
                      </select>
                      <select value={editPlan.settlement} onChange={e => setEditPlan(v => ({ ...v, settlement: e.target.value }))} className="text-[12px] border border-gray-200 rounded-xl px-2 py-1.5 bg-white">
                        <option value="manual">手动结算</option>
                        <option value="auto">自动到账</option>
                      </select>
                    </div>
                    {/* Tab 切换 - 四个模块 */}
                    <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                      {(['sales', 'levels', 'genbonus', 'dividend'] as const).map((tab, i) => {
                        const labels = ['销售提成', '代数佣金', '直级奖', '分红'];
                        return (
                          <button key={tab} onClick={() => setPlanEditTab(tab)}
                            className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${planEditTab === tab ? 'text-white' : 'text-gray-500 bg-white'}`}
                            style={planEditTab === tab ? { background: '#FF6900' } : {}}>
                            {labels[i]}
                          </button>
                        );
                      })}
                    </div>
                    {/* 销售提成 Tab */}
                    {planEditTab === 'sales' && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">卖货人固定销售提成，不受职级影响</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-gray-500 w-16 flex-shrink-0">销售提成</span>
                          <input type="number" min="0" max="100" placeholder="30" value={editPlanSalesRate} onChange={e => setEditPlanSalesRate(e.target.value)} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none" />
                          <span className="text-[11px] text-gray-400">%</span>
                        </div>
                        <p className="text-[10px] text-gray-300">参考康宝莱：最高 30%，按个人业绩档位递增</p>
                      </div>
                    )}
                    {/* 代数佣金 Tab - 固定前 N 代 */}
                    {planEditTab === 'levels' && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">固定前 N 代，每一代拿多少（对应康宝莱「佣金抽成 5% 三代」）</p>
                        {editPlanLevels.map((lv, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0">第{idx + 1}代上级</span>
                            <input type="number" min="0" max="100" placeholder="%" value={lv.rate} onChange={e => setEditPlanLevels(ls => ls.map((l, i) => i === idx ? { rate: e.target.value } : l))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none" />
                            <span className="text-[11px] text-gray-400">%</span>
                            {editPlanLevels.length > 1 && <button onClick={() => setEditPlanLevels(ls => ls.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 text-[13px] w-5">✕</button>}
                          </div>
                        ))}
                        <button onClick={() => setEditPlanLevels(ls => [...ls, { rate: '' }])} className="text-[12px] text-orange-500">+ 添加一代</button>
                      </div>
                    )}
                    {/* 直级奖 Tab - 按职级配置，无限代穿透，遇同级截断 */}
                    {planEditTab === 'genbonus' && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">设定每个职级的「累计天花板」，实际到手 = 自己天花板 − 下面最近有资格人的天花板。最高职级的天花板即为每笔订单直级奖最多支出多少</p>
                        {['米商', '米行', '米庄'].map((rankName, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium w-14 flex-shrink-0 px-1.5 py-0.5 rounded-lg text-center ${
                              idx === 0 ? 'bg-orange-50 text-orange-500' :
                              idx === 1 ? 'bg-purple-50 text-purple-500' :
                              'bg-yellow-50 text-yellow-600'
                            }`}>{rankName}</span>
                            <input type="number" min="0" max="100" placeholder="0" value={editPlanGenBonus[idx]?.rate ?? ''} onChange={e => setEditPlanGenBonus(gs => { const next = [...gs]; while (next.length <= idx) next.push({ rate: '' }); next[idx] = { rate: e.target.value }; return next; })} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none" />
                            <span className="text-[11px] text-gray-400">%</span>
                          </div>
                        ))}
                        <p className="text-[10px] text-gray-300">米农不参与直级奖。比例必须递增，否则计算会出负数。参考康宝莱：米商 2%、米行 4%、米庄 6%</p>
                      </div>
                    )}
                    {/* 分红 Tab - 达到米庄职级后参与 */}
                    {planEditTab === 'dividend' && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">达到米庄职级后参与分红，按全平台总销售额的固定比例发放（对应康宝莱全球分红1%）</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-gray-500 w-16 flex-shrink-0">分红比例</span>
                          <input type="number" min="0" max="100" placeholder="1" value={editPlanDividendRate} onChange={e => setEditPlanDividendRate(e.target.value)} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none" />
                          <span className="text-[11px] text-gray-400">%</span>
                        </div>
                        <p className="text-[10px] text-gray-300">参考康宝莱：全球分红1%，中国区分红1%</p>
                      </div>
                    )}
                    {/* 分配汇总区域 */}
                    {(() => {
                      const salesRate = Number(editPlanSalesRate) || 0;
                      const levelsTotal = editPlanLevels.reduce((s, l) => s + (Number(l.rate) || 0), 0);
                      const genBonusMax = editPlanGenBonus.length > 0 ? Math.max(...editPlanGenBonus.map(g => Number(g.rate) || 0)) : 0;
                      const ranksTotal = editPlanRanks.reduce((s, r) => s + (Number(r.bonusRate) || 0), 0);
                      const dividendRate = Number(editPlanDividendRate) || 0;
                      const allocated = salesRate + levelsTotal + genBonusMax + ranksTotal + dividendRate;
                      const remaining = 100 - allocated;
                      const isOver = allocated > 100;
                      return (
                        <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2">
                          <p className="text-[11px] font-semibold text-gray-500">拨出率分配汇总（占总拨出率 100%）</p>
                          <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden flex">
                            <div className="h-full transition-all" style={{ width: `${Math.min(salesRate, 100)}%`, background: '#10B981' }} />
                            <div className="h-full transition-all" style={{ width: `${Math.min(levelsTotal, 100 - salesRate)}%`, background: '#FF6900' }} />
                            <div className="h-full transition-all" style={{ width: `${Math.min(genBonusMax, 100 - salesRate - levelsTotal)}%`, background: '#8B5CF6' }} />
                            <div className="h-full transition-all" style={{ width: `${Math.min(ranksTotal, 100 - salesRate - levelsTotal - genBonusMax)}%`, background: '#3B82F6' }} />
                            <div className="h-full transition-all" style={{ width: `${Math.min(dividendRate, 100 - salesRate - levelsTotal - genBonusMax - ranksTotal)}%`, background: '#EC4899' }} />
                          </div>
                          <div className="grid grid-cols-5 gap-1 text-center">
                            <div className="rounded-lg bg-green-50 py-1.5">
                              <p className="text-[13px] font-bold text-green-600">{salesRate.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">销售提成</p>
                            </div>
                            <div className="rounded-lg bg-orange-50 py-1.5">
                              <p className="text-[13px] font-bold" style={{ color: '#FF6900' }}>{levelsTotal.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">代数佣金</p>
                            </div>
                            <div className="rounded-lg py-1.5" style={{ background: '#F5F3FF' }}>
                              <p className="text-[13px] font-bold" style={{ color: '#7C3AED' }}>{genBonusMax.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">直级奖</p>
                            </div>
                            <div className="rounded-lg bg-pink-50 py-1.5">
                              <p className="text-[13px] font-bold text-pink-500">{dividendRate.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">分红</p>
                            </div>
                            <div className={`rounded-lg py-1.5 ${isOver ? 'bg-red-50' : 'bg-gray-50'}`}>
                              <p className={`text-[13px] font-bold ${isOver ? 'text-red-500' : 'text-gray-600'}`}>{remaining.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">{isOver ? '超出！' : '入账'}</p>
                            </div>
                          </div>
                          {genBonusMax > 0 && <p className="text-[10px]" style={{ color: '#7C3AED' }}>直级奖最高 {genBonusMax}%（米庄天花板，占拨出率额度）</p>}
                          {isOver && <p className="text-[11px] text-red-400 text-center">分配比例已超过 100%，请调整后再保存</p>}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const levels = editPlanLevels.map((l, i) => ({ levelIndex: i + 1, rate: Number(l.rate) / 100 })).filter(l => l.rate > 0);
                        const generationBonus = editPlanGenBonus.map((g, i) => ({ genIndex: i + 1, rate: Number(g.rate) / 100 })).filter(g => g.rate > 0);
                        const ranks = editPlanRanks.map((r, i) => ({ rankIndex: i + 1, name: r.name, bonusRate: Number(r.bonusRate) / 100, conditionType: 'personal' as any, unlockType: r.unlockType as any, personalCumulativeMin: r.personalCumulativeMin ? Number(r.personalCumulativeMin) : null, teamCumulativeMin: r.teamCumulativeMin ? Number(r.teamCumulativeMin) : null, personalSalesMin: null, teamSizeMin: null, teamSalesMin: null })).filter(r => r.name);
                        const salesRate = Number(editPlanSalesRate) / 100;
                        const dividendRate = Number(editPlanDividendRate) / 100;
                        updatePlanMut.mutate({ id: p.id, name: editPlan.name, triggerEvent: editPlan.trigger as any, settlement: editPlan.settlement as any, salesRate, dividendRate, levels, generationBonus, ranks });
                      }} disabled={!editPlan.name || updatePlanMut.isPending} className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: '#FF6900' }}>
                        {updatePlanMut.isPending ? '保存中...' : '保存制度'}
                      </button>
                      <button onClick={() => setEditingPlanId(null)} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 border border-gray-200">取消</button>
                    </div>
                  </div>
                ) : (
                  // 展示模式
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-black">{p.name}</p>
                        <p className="text-[11px] text-gray-400">{p.triggerEvent === 'order_confirmed' ? '确认收货触发' : '下单触发'} · {p.settlement === 'auto' ? '自动到账' : '手动结算'}</p>
                      </div>
                      <button onClick={() => {
                        setEditingPlanId(p.id);
                        setPlanEditTab('levels');
                        setEditPlan({ name: p.name, trigger: p.triggerEvent ?? 'order_confirmed', settlement: p.settlement ?? 'manual' });
                        setEditPlanSalesRate(p.salesRate != null ? String(Math.round(p.salesRate * 100)) : '30');
                        setEditPlanDividendRate(p.dividendRate != null ? String(Math.round(p.dividendRate * 100)) : '');
                        setEditPlanLevels((p.levels ?? []).length > 0 ? (p.levels as any[]).map((lv: any) => ({ rate: String(Math.round(lv.rate * 100)) })) : [{ rate: '' }]);
                        setEditPlanGenBonus((p.generationBonus ?? []).length > 0 ? (p.generationBonus as any[]).map((gb: any) => ({ rate: String(Math.round(gb.rate * 100)) })) : [{ rate: '6' }, { rate: '4' }, { rate: '2' }]);
                        setEditPlanRanks((p.ranks ?? []).length > 0 ? (p.ranks as any[]).map((rk: any) => ({ name: rk.name, bonusRate: String(Math.round(rk.bonusRate * 100)), unlockType: rk.unlockType ?? 'personal_cumulative', personalCumulativeMin: rk.personalCumulativeMin != null ? String(rk.personalCumulativeMin) : '', teamCumulativeMin: rk.teamCumulativeMin != null ? String(rk.teamCumulativeMin) : '' })) : []);
                        setPlanEditTab('sales');
                      }} className="text-[12px] text-orange-400 font-medium px-2">编辑</button>
                      <button onClick={() => deletePlanMut.mutate({ id: p.id })} className="text-gray-300 hover:text-red-400 text-[12px]">删除</button>
                    </div>
                    {/* 奖金结构图 */}
                    {(() => {
                      const levels: any[] = p.levels ?? [];
                      const ranks: any[] = p.ranks ?? [];
                      if (!levels.length && !ranks.length) return null;
                      const levelsTotal = levels.reduce((s: number, l: any) => s + l.rate, 0);
                      const ranksTotal = ranks.reduce((s: number, r: any) => s + r.bonusRate, 0);
                      const remaining = Math.max(0, 1 - levelsTotal - ranksTotal);
                      return (
                        <div className="mt-2 space-y-2">
                          {/* 代数佣金链路 */}
                          {levels.length > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 mb-1">代数佣金</p>
                              <div className="flex items-center gap-0.5 overflow-x-auto">
                                {levels.map((lv: any, idx: number) => (
                                  <div key={lv.levelIndex} className="flex items-center gap-0.5 flex-shrink-0">
                                    <div className="flex flex-col items-center">
                                      <div className="rounded-lg px-2 py-1 text-center" style={{ background: `rgba(255,105,0,${0.15 + idx * 0.08})` }}>
                                        <p className="text-[11px] font-bold" style={{ color: '#FF6900' }}>{(lv.rate * 100).toFixed(0)}%</p>
                                        <p className="text-[9px] text-gray-500">{idx === 0 ? '卖货人' : `第${idx}代`}</p>
                                      </div>
                                    </div>
                                    {idx < levels.length - 1 && <span className="text-gray-300 text-[10px] flex-shrink-0">→</span>}
                                  </div>
                                ))}
                                {remaining > 0 && (
                                  <>
                                    <span className="text-gray-200 text-[10px] flex-shrink-0 mx-0.5">|</span>
                                    <div className="rounded-lg px-2 py-1 text-center bg-green-50 flex-shrink-0">
                                      <p className="text-[11px] font-bold text-green-600">{(remaining * 100).toFixed(0)}%</p>
                                      <p className="text-[9px] text-gray-400">入账</p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          {/* 职级奖金 */}
                          {ranks.length > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 mb-1">职级奖金</p>
                              <div className="flex flex-wrap gap-1">
                                {ranks.map((rk: any) => {
                                  const condLabel = rk.conditionType === 'personal' ? '个人' : rk.conditionType === 'team' ? '团队' : '两者';
                                  const condDetail = [
                                    rk.personalSalesMin ? `个人月销≥${rk.personalSalesMin}元` : null,
                                    rk.teamSizeMin ? `团队≥${rk.teamSizeMin}人` : null,
                                    rk.teamSalesMin ? `团月销≥${rk.teamSalesMin}元` : null,
                                  ].filter(Boolean).join(' ');
                                  return (
                                    <div key={rk.rankIndex} className="rounded-lg px-2 py-1 bg-blue-50 flex items-center gap-1.5">
                                      <div>
                                        <p className="text-[11px] font-bold text-blue-600">{rk.name} <span className="text-blue-400">{(rk.bonusRate * 100).toFixed(0)}%</span></p>
                                        {condDetail && <p className="text-[9px] text-gray-400">{condLabel}: {condDetail}</p>}
                                        {!condDetail && <p className="text-[9px] text-gray-400">{condLabel}达标</p>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 底部新建团队按鈕 ── */}
      <div className="flex justify-center pt-1 pb-2">
        <button
          onClick={() => setShowTeamForm(v => !v)}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-orange-500 transition-colors"
        >
          <span className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-[16px] leading-none hover:border-orange-400">+</span>
          添加团队
        </button>
      </div>
      {showTeamForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2">
          <p className="text-[13px] font-bold text-black">新建团队</p>
          <input placeholder="团队名称" value={newTeam.name} onChange={e => setNewTeam(t => ({ ...t, name: e.target.value }))} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
          <div className="relative">
            {newTeam.rootUserName ? (
              <div className="flex items-center gap-2 border border-orange-300 rounded-xl px-3 py-2 bg-white">
                <span className="flex-1 text-[13px] text-orange-600">{newTeam.rootUserName}（ID: {newTeam.rootUserId}）</span>
                <button onClick={() => { setNewTeam(t => ({ ...t, rootUserId: "", rootUserName: "" })); setUserSearch(""); setUserDropdownOpen(true); }} className="text-[11px] text-gray-400 hover:text-red-400">重新选择</button>
              </div>
            ) : (
              <input
                placeholder="点击搜索或选择根节点用户"
                value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setUserDropdownOpen(true); }}
                onFocus={() => setUserDropdownOpen(true)}
                onBlur={() => setTimeout(() => setUserDropdownOpen(false), 300)}
                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300"
              />
            )}
            {userDropdownOpen && !newTeam.rootUserId && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                {searchResults.map((u: any) => (
                  <button key={u.id} onMouseDown={() => { setNewTeam(t => ({ ...t, rootUserId: String(u.id), rootUserName: u.name || u.username || String(u.id) })); setUserSearch(""); setUserDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-orange-50 border-b border-gray-50 last:border-0">
                    {u.name || "匿名"} <span className="text-gray-400">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={newTeam.planId} onChange={e => setNewTeam(t => ({ ...t, planId: e.target.value }))} className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
            <option value="">选择销售制度（可选）</option>
            {plans.map((p: any) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="1000" placeholder="100" value={newTeam.multiplier} onChange={e => setNewTeam(t => ({ ...t, multiplier: e.target.value }))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
            <span className="text-[13px] text-gray-400 flex-shrink-0">% 拨出系数</span>
          </div>
          <button onClick={() => createTeamMut.mutate({ name: newTeam.name, rootUserId: Number(newTeam.rootUserId), commissionPlanId: newTeam.planId ? Number(newTeam.planId) : undefined, payoutRateMultiplier: Number(newTeam.multiplier) / 100 }, {
            onSuccess: () => { setShowTeamForm(false); setNewTeam({ name: "", rootUserId: "", rootUserName: "", planId: "", multiplier: "100" }); setUserSearch(""); }
          })} disabled={!newTeam.name || !newTeam.rootUserId || createTeamMut.isPending} className="w-full py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#FF6900" }}>
            {createTeamMut.isPending ? "创建中..." : "确认创建"}
          </button>
        </div>
      )}
    </div>

    {/* ── 参考说明弹窗 ── */}
    {showPlanGuide && (
      <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowPlanGuide(false)}>
        <div className="w-full bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between z-10">
            <div>
              <p className="text-[16px] font-bold text-black">奖金制度参考说明</p>
              <p className="text-[11px] text-gray-400">以康宝莱（贺宝芙）制度为参考范本</p>
            </div>
            <button onClick={() => setShowPlanGuide(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[14px]">✕</button>
          </div>
          <div className="px-4 py-4 space-y-6">
            {/* 概览 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-2">一、制度概览</p>
              <p className="text-[12px] text-gray-500 mb-3">康宝莱奖金池占产品销售额的 <span className="font-bold text-orange-500">72%</span>，共分五大类收入：</p>
              <div className="space-y-2">
                {[
                  { name: '零售利润（销售提成）', rate: '15%～50%', desc: '自己卖货，批零差价直接赚', color: 'bg-green-50 text-green-600' },
                  { name: '批发利润（直推奖）', rate: '8%～25%', desc: '直接下线进货时拿差价', color: 'bg-blue-50 text-blue-600' },
                  { name: '佣金抽成（代数佣金）', rate: '5% × 3代', desc: '成为督导后，下线前3代各5%', color: 'bg-orange-50 text-orange-600' },
                  { name: '绩效奖金（职级穿透奖）', rate: '2%/4%/6% 无限代', desc: '达到更高职级后解锁，遇同级截断', color: 'bg-purple-50 text-purple-600' },
                  { name: '全球/中国区分红', rate: '各1%', desc: '达到总裁级别才能参与', color: 'bg-gray-100 text-gray-500' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl p-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ${item.color}`}>{item.rate}</span>
                    <div>
                      <p className="text-[12px] font-semibold text-gray-700">{item.name}</p>
                      <p className="text-[11px] text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* 销售提成 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-1">二、零售利润（销售提成）</p>
              <p className="text-[12px] text-gray-500 mb-2">卖货人自己赚的，批发价和零售价之间的差价，业绩越高档位越高。</p>
              <div className="bg-green-50 rounded-xl p-3 space-y-1">
                {[['月销¥1,200', '15%'],['月销¥6,000', '25%'],['月销¥30,000', '35%'],['月销¥48,000', '42%'],['督导级别', '50%（最高）']].map(([v,r])=>(
                  <div key={v} className="flex justify-between text-[12px]"><span className="text-gray-600">{v}</span><span className="font-bold text-green-600">{r}</span></div>
                ))}
              </div>
              <div className="mt-2 bg-gray-50 rounded-xl p-2.5">
                <p className="text-[11px] text-gray-500">📌 案例：小王本月卖出¥10,000，处于25%档，销售提成 = ¥10,000 × 25% = <span className="font-bold text-green-600">¥2,500</span></p>
              </div>
            </div>
            {/* 代数佣金 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-1">三、佣金抽成（代数佣金）</p>
              <p className="text-[12px] text-gray-500 mb-2">成为督导后，可以拿下线中<span className="font-semibold text-orange-500">前3代督导</span>的销售额各5%，固定不变，不受职级截断影响。</p>
              <div className="bg-orange-50 rounded-xl p-3 font-mono text-[11px] text-gray-700 space-y-0.5">
                <p>小王（督导）</p>
                <p className="pl-3">└── 小李（督导）← 第1代，小王拿 <span className="font-bold text-orange-600">5%</span></p>
                <p className="pl-8">└── 小张（督导）← 第2代，小王拿 <span className="font-bold text-orange-600">5%</span></p>
                <p className="pl-12">└── 小赵（督导）← 第3代，小王拿 <span className="font-bold text-orange-600">5%</span></p>
                <p className="pl-16">└── 小陈（督导）← 第4代，<span className="text-gray-400">拿不到了</span></p>
              </div>
              <div className="mt-2 bg-gray-50 rounded-xl p-2.5">
                <p className="text-[11px] text-gray-500">📌 案例：小李月销¥20,000、小张¥15,000、小赵¥10,000</p>
                <p className="text-[11px] text-gray-500 mt-1">小王代数佣金 = ¥1,000 + ¥750 + ¥500 = <span className="font-bold text-orange-600">¥2,250</span></p>
              </div>
            </div>
            {/* 职级穿透奖 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-1">四、绩效奖金（职级穿透奖）⭐ 核心</p>
              <p className="text-[12px] text-gray-500 mb-2">无限代穿透，但<span className="font-bold text-red-500">遇到同级或更高级的人会被截断</span>，这是康宝莱制度的精髓。</p>
              <div className="bg-purple-50 rounded-xl p-3 space-y-1 mb-2">
                <div className="flex justify-between text-[12px]"><span className="text-gray-600">第1代下线督导</span><span className="font-bold text-purple-600">6%</span></div>
                <div className="flex justify-between text-[12px]"><span className="text-gray-600">第2代下线督导</span><span className="font-bold text-purple-600">4%</span></div>
                <div className="flex justify-between text-[12px]"><span className="text-gray-600">第3代及以后（无限代）</span><span className="font-bold text-purple-600">2%</span></div>
              </div>
              <p className="text-[12px] font-semibold text-gray-700 mb-1">案例1：下面无同级，无限穿透 ✅</p>
              <div className="bg-gray-50 rounded-xl p-2.5 font-mono text-[11px] text-gray-700 space-y-0.5 mb-2">
                <p>小王（总监级）</p>
                <p className="pl-3">└── 小李（督导）← <span className="text-purple-600 font-bold">6%</span></p>
                <p className="pl-8">└── 小张（督导）← <span className="text-purple-600 font-bold">4%</span></p>
                <p className="pl-12">└── 小赵（督导）← <span className="text-purple-600 font-bold">2%</span></p>
                <p className="pl-16">└── 小陈（督导）← <span className="text-purple-600 font-bold">2%</span>（无限代）</p>
              </div>
              <p className="text-[12px] font-semibold text-gray-700 mb-1">案例2：下面出现同级，被截断 ❌</p>
              <div className="bg-red-50 rounded-xl p-2.5 font-mono text-[11px] text-gray-700 space-y-0.5 mb-2">
                <p>小王（总监级）</p>
                <p className="pl-3">└── 小李（<span className="text-red-500 font-bold">总监级，同级！</span>）← 小王拿6%，但被截断</p>
                <p className="pl-8">└── 小张（督导）← <span className="text-gray-400">小王拿不到！</span></p>
                <p className="pl-12">└── 小赵（督导）← <span className="text-gray-400">小王拿不到！</span></p>
              </div>
              <p className="text-[12px] font-semibold text-gray-700 mb-1">案例3：混合情况</p>
              <div className="bg-gray-50 rounded-xl p-2.5 font-mono text-[11px] text-gray-700 space-y-0.5">
                <p>小王（总监级）</p>
                <p className="pl-3">├── 小李（督导，低于小王）← <span className="text-purple-600 font-bold">6%</span>，不截断</p>
                <p className="pl-8">│   └── 小张（督导）← <span className="text-purple-600 font-bold">4%</span></p>
                <p className="pl-12">│       └── 小赵（<span className="text-red-500 font-bold">总监级，同级！</span>）← <span className="text-purple-600 font-bold">2%</span>，被截断</p>
                <p className="pl-16">│           └── 小陈（督导）← <span className="text-gray-400">拿不到！</span></p>
                <p className="pl-3">└── 小刘（<span className="text-red-500 font-bold">总监级，同级！</span>）← <span className="text-purple-600 font-bold">6%</span>，被截断</p>
                <p className="pl-8">    └── 小周（督导）← <span className="text-gray-400">拿不到！</span></p>
              </div>
              <div className="mt-2 bg-purple-50 rounded-xl p-2.5">
                <p className="text-[11px] text-gray-600 font-semibold">💡 为什么要截断？</p>
                <p className="text-[11px] text-gray-500 mt-0.5">压缩制的目的是激励上级帮助下级成长。当下级升到和你同级时，他就「独立」了，你不再能靠他的下线赚钱，这逼着你要么继续升级，要么去发展新的下线。</p>
              </div>
            </div>
            {/* 综合案例 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-1">五、综合案例：一笔¥100订单的完整分配</p>
              <p className="text-[12px] text-gray-500 mb-2">假设总拨出率10%，奖金池 = ¥10</p>
              <div className="bg-gray-50 rounded-xl p-2.5 font-mono text-[11px] text-gray-700 space-y-0.5 mb-3">
                <p>老板（您）</p>
                <p className="pl-3">└── 小王（米行级）</p>
                <p className="pl-8">    └── 小李（米商级）</p>
                <p className="pl-12">        └── 小张（米农，<span className="text-green-600 font-bold">卖货人</span>）← 卖出¥100</p>
              </div>
              <div className="space-y-1.5">
                {[
                  { who: '小张（卖货人）', rule: '销售提成 30%', amount: '¥3.00', color: 'text-green-600' },
                  { who: '小李（第1代上级）', rule: '代数佣金 5%', amount: '¥0.50', color: 'text-orange-600' },
                  { who: '小王（第2代上级）', rule: '代数佣金 5%', amount: '¥0.50', color: 'text-orange-600' },
                  { who: '小李（米商级）', rule: '绩效奖 6%（第1代）', amount: '¥0.60', color: 'text-purple-600' },
                  { who: '小王（米行级）', rule: '绩效奖 4%（第2代）', amount: '¥0.40', color: 'text-purple-600' },
                  { who: '您（入账）', rule: '剩余 50%', amount: '¥5.00', color: 'text-gray-700 font-bold' },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${i === 5 ? 'bg-green-50' : 'bg-white border border-gray-100'}`}>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-gray-700">{row.who}</p>
                      <p className="text-[10px] text-gray-400">{row.rule}</p>
                    </div>
                    <span className={`text-[13px] font-bold ${row.color}`}>{row.amount}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 职级体系 */}
            <div>
              <p className="text-[13px] font-bold text-black mb-2">六、职级体系参考（米瓣版）</p>
              <div className="space-y-1.5">
                {[
                  { rank: '米农', cond: '注册即有，无門槛', unlock: '销售提成', color: 'bg-gray-100 text-gray-600' },
                  { rank: '米商', cond: '个人累计销售满¥X（可自定义）', unlock: '代数佣金', color: 'bg-orange-50 text-orange-600' },
                  { rank: '米行', cond: '团队累计满¥X（可自定义）', unlock: '绩效奖（职级穿透）', color: 'bg-purple-50 text-purple-600' },
                  { rank: '米庄', cond: '团队累计满¥X（可自定义）', unlock: '绩效奖（最高档）+分红', color: 'bg-yellow-50 text-yellow-700' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ${item.color}`}>{item.rank}</span>
                    <div className="flex-1"><p className="text-[11px] text-gray-500">{item.cond}</p></div>
                    <span className="text-[10px] text-gray-400">{item.unlock}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">以上职级条件和比例均可在制度配置中自定义</p>
            </div>
            <div className="h-4" />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── 团队长视图：我的团队业绩 ─────────────────────────────────────────────────
function AgentTeamPanel() {
  const { data: stats, isLoading: statsLoading } = mtrpc.agent.myMonthlyStats.useQuery();
  const { data: referrals, isLoading: referralsLoading } = mtrpc.agent.myReferrals.useQuery();
  const { data: commissions, isLoading: commissionsLoading } = mtrpc.agent.myCommissions.useQuery();
  const { data: inviteInfo } = mtrpc.agent.myInviteInfo.useQuery();
  const inviteLink = inviteInfo?.inviteCode ? `${window.location.origin}/join?ref=${inviteInfo.inviteCode}` : "";

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 text-white" style={{ background: "#FF6900" }}>
            <p className="text-[11px] text-white/70 mb-1">本月总佣金</p>
            <p className="text-[22px] font-bold">¥{Number(stats?.totalCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">待结算</p>
            <p className="text-[22px] font-bold text-amber-500">¥{Number(stats?.pendingCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">已结算</p>
            <p className="text-[22px] font-bold text-green-500">¥{Number(stats?.settledCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">本月订单数</p>
            <p className="text-[22px] font-bold text-gray-800">{stats?.orderCount ?? 0}<span className="text-[12px] font-normal text-gray-400 ml-1">单</span></p>
          </div>
        </div>
      )}

      {/* 邀请码 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] text-gray-400 mb-1">我的邀请码</p>
            <p className="text-[28px] font-mono font-bold tracking-[0.2em]" style={{ color: "#FF6900" }}>
              {inviteInfo?.inviteCode ?? "——"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400 mb-1">已推荐</p>
            <p className="text-[24px] font-bold text-gray-800">{inviteInfo?.inviteCount ?? 0}<span className="text-[12px] font-normal text-gray-400 ml-1">人</span></p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <p className="text-[11px] text-gray-400 flex-1 truncate">{inviteLink || "生成中…"}</p>
          <button
            onClick={() => { if (inviteLink) navigator.clipboard.writeText(inviteLink).then(() => toast.success("邀请链接已复制")); }}
            className="flex items-center gap-1 text-[12px] font-semibold flex-shrink-0 active:scale-95 transition-transform"
            style={{ color: "#FF6900" }}
          >
            <Copy className="w-3.5 h-3.5" />复制
          </button>
        </div>
      </div>

      {/* 推荐用户 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-3">推荐用户 {referrals ? `(${referrals.length})` : ""}</h3>
        {referralsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : !referrals?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无推荐用户</div>
        ) : (
          <div className="space-y-2">
            {referrals.map((u: any) => (
              <div key={u.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: "#FF6900" }}>
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-[11px] text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString("zh-CN") : ""} 加入</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-gray-400">推荐</p>
                  <p className="text-[13px] font-medium text-gray-600">{u.inviteCount} 人</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 佣金明细 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-3">佣金明细 {commissions ? `(${commissions.length})` : ""}</h3>
        {commissionsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !commissions?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无佣金记录</div>
        ) : (
          <div className="space-y-2">
            {commissions.map((c: any) => (
              <div key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-400 font-mono">{c.orderNo}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === "settled" ? "bg-green-50 text-green-600" : c.status === "cancelled" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"}`}>
                    {c.status === "settled" ? "已结算" : c.status === "cancelled" ? "已取消" : "待结算"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400">订单 ¥{Number(c.orderAmount).toFixed(2)} · 比例 {(Number(c.commissionRate) * 100).toFixed(1)}%</p>
                  <p className="text-[15px] font-bold" style={{ color: "#FF6900" }}>+¥{Number(c.commissionAmount).toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-gray-300 mt-1">{new Date(c.createdAt).toLocaleDateString("zh-CN")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
type AdminTabKey = "orders" | "rice" | "inventory" | "warehouse" | "users" | "teamManage" | "team" | "commission" | "referrals" | "pending" | "aftersale" | "teamOrders";

// ─── 待结算佣金面板 ─────────────────────────────────────────────────────
function PendingCommissionsPanel() {
  const { data: pending, isLoading, refetch } = mtrpc.adminCommission.listPending.useQuery();
  const settleMut = mtrpc.adminCommission.settleMany.useMutation({
    onSuccess: (res: any) => { toast.success(`已结算 ${res.settled} 条佣金`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!pending) return;
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((r: any) => r.id)));
  }

  function settleSelected() {
    if (!selected.size) return;
    settleMut.mutate({ ids: Array.from(selected) });
    setSelected(new Set());
  }

  function settleOne(id: number) {
    settleMut.mutate({ ids: [id] });
  }

  const totalPending = (pending ?? []).reduce((s: number, r: any) => s + r.commissionAmount, 0);

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">待结算佣金总额</p>
            <p className="text-[22px] font-bold" style={{ color: '#FF6900' }}>¥{totalPending.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">共 {(pending ?? []).length} 条记录</p>
            {selected.size > 0 && (
              <p className="text-[11px] text-orange-500">已选 {selected.size} 条</p>
            )}
          </div>
        </div>
        {/* 批量操作按鈕 */}
        {(pending ?? []).length > 0 && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={selectAll}
              className="flex-1 text-[12px] font-medium py-2 rounded-xl border border-gray-200 text-gray-600 active:bg-gray-50"
            >
              {selected.size === (pending ?? []).length ? '取消全选' : '全选'}
            </button>
            <button
              onClick={settleSelected}
              disabled={selected.size === 0 || settleMut.isPending}
              className="flex-1 text-[12px] font-semibold py-2 rounded-xl text-white disabled:opacity-40"
              style={{ background: '#FF6900' }}
            >
              {settleMut.isPending ? '结算中...' : `确认结算选中 (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : !(pending ?? []).length ? (
        <div className="text-center py-16 text-gray-300 text-[13px]">暂无待结算佣金</div>
      ) : (
        <div className="space-y-2">
          {(pending as any[]).map((r: any) => (
            <div
              key={r.id}
              onClick={() => toggleSelect(r.id)}
              className={`bg-white rounded-xl border px-4 py-3 shadow-sm transition-all ${
                selected.has(r.id) ? 'border-orange-400 bg-orange-50/40' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    selected.has(r.id) ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                  }`}>
                    {selected.has(r.id) && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-black truncate">{r.agentName}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{r.orderNo}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-bold" style={{ color: '#FF6900' }}>¥{r.commissionAmount.toFixed(2)}</p>
                  <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleDateString('zh-CN')}</p>
                </div>
              </div>
              {r.note && <p className="text-[10px] text-gray-400 mt-1.5 pl-6 truncate">{r.note}</p>}
              <div className="flex justify-end mt-2">
                <button
                  onClick={(e) => { e.stopPropagation(); settleOne(r.id); }}
                  disabled={settleMut.isPending}
                  className="text-[11px] font-semibold px-3 py-1 rounded-lg text-white disabled:opacity-40"
                  style={{ background: '#FF6900' }}
                >
                  立即结算
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 售后管理面板 ────────────────────────────────────────────────────────────
const AFTERSALE_TYPE_LABELS: Record<string, string> = { refund: '退款', exchange: '换货', complaint: '投诉' };
const AFTERSALE_STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-blue-600 bg-blue-50',
  rejected: 'text-red-500 bg-red-50',
  completed: 'text-green-600 bg-green-50',
};
const AFTERSALE_STATUS_LABELS: Record<string, string> = { pending: '待处理', approved: '已审批', rejected: '已拒绝', completed: '已完成' };

function AftersalePanel() {
  const { data: requests, isLoading, refetch } = mtrpc.aftersale.allRequests.useQuery();
  const processMut = mtrpc.aftersale.process.useMutation({
    onSuccess: () => { toast.success('处理成功'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [refundInputs, setRefundInputs] = useState<Record<number, string>>({});

  const filtered = (requests ?? []).filter((r: any) => filterStatus === 'all' || r.status === filterStatus);
  const countPending = (requests ?? []).filter((r: any) => r.status === 'pending').length;

  return (
    <div className="space-y-3">
      {/* 汇总卡片 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">售后申请总数</p>
            <p className="text-[22px] font-bold text-black">{(requests ?? []).length}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">待处理</p>
            <p className="text-[22px] font-bold" style={{ color: '#FF6900' }}>{countPending}</p>
          </div>
        </div>
      </div>
      {/* 状态筛选 */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {['all', 'pending', 'approved', 'rejected', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="flex-shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: filterStatus === s ? '#FF6900' : '#fff',
              color: filterStatus === s ? '#fff' : '#6b7280',
              borderColor: filterStatus === s ? '#FF6900' : '#e5e7eb',
            }}
          >
            {s === 'all' ? '全部' : AFTERSALE_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16 text-gray-300 text-[13px]">暂无售后申请</div>
      ) : (
        <div className="space-y-2">
          {(filtered as any[]).map((r: any) => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">{AFTERSALE_TYPE_LABELS[r.type] ?? r.type}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${AFTERSALE_STATUS_COLORS[r.status] ?? 'text-gray-500 bg-gray-100'}`}>{AFTERSALE_STATUS_LABELS[r.status] ?? r.status}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-black truncate">{r.orderNo}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.reason}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] text-gray-400">{r.userName ?? '用户'}</p>
                    <p className="text-[10px] text-gray-300">{new Date(r.createdAt).toLocaleDateString('zh-CN')}</p>
                  </div>
                </div>
              </div>
              {/* 展开处理区 */}
              {expandedId === r.id && (
                <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/50 space-y-2">
                  {r.adminReply && (
                    <p className="text-[11px] text-gray-500">审批回复：{r.adminReply}</p>
                  )}
                  <input
                    value={replyInputs[r.id] ?? ''}
                    onChange={e => setReplyInputs(p => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="回复内容（可选）"
                    className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-orange-300"
                  />
                  <input
                    type="number"
                    value={refundInputs[r.id] ?? ''}
                    onChange={e => setRefundInputs(p => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="退款金额（可选）"
                    className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-orange-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => processMut.mutate({ id: r.id, status: 'approved', adminReply: replyInputs[r.id] || undefined, refundAmount: refundInputs[r.id] ? Number(refundInputs[r.id]) : undefined })}
                      disabled={processMut.isPending}
                      className="flex-1 text-[12px] font-semibold py-2 rounded-xl text-white disabled:opacity-40"
                      style={{ background: '#FF6900' }}
                    >审批</button>
                    <button
                      onClick={() => processMut.mutate({ id: r.id, status: 'completed', adminReply: replyInputs[r.id] || undefined, refundAmount: refundInputs[r.id] ? Number(refundInputs[r.id]) : undefined })}
                      disabled={processMut.isPending}
                      className="flex-1 text-[12px] font-semibold py-2 rounded-xl text-white disabled:opacity-40 bg-green-500"
                    >完成</button>
                    <button
                      onClick={() => processMut.mutate({ id: r.id, status: 'rejected', adminReply: replyInputs[r.id] || undefined })}
                      disabled={processMut.isPending}
                      className="flex-1 text-[12px] font-semibold py-2 rounded-xl border border-red-200 text-red-500 disabled:opacity-40"
                    >拒绝</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 团队订单面板（业务员视图） ─────────────────────────────────────────────────
function TeamOrdersPanel() {
  const { data: orders, isLoading } = mtrpc.order.teamOrders.useQuery();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');

  const filtered = (orders ?? []).filter((o: any) => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      return (
        String(o.id).includes(kw) ||
        (o.orderNo ?? '').toLowerCase().includes(kw) ||
        (o.receiverName ?? '').toLowerCase().includes(kw) ||
        (o.memberName ?? '').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  const totalRevenue = (orders ?? []).filter((o: any) => o.status !== 'cancelled').reduce((s: number, o: any) => s + Number(o.totalPrice ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* 汇总 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">团队订单总金额</p>
            <p className="text-[22px] font-bold" style={{ color: '#FF6900' }}>￥{totalRevenue.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">共 {(orders ?? []).length} 笔</p>
          </div>
        </div>
      </div>
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
        <input
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="搜索订单号/收货人/成员名"
          className="w-full pl-9 pr-4 py-2.5 text-[12px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-300"
        />
      </div>
      {/* 状态筛选 */}
      <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {[['all','全部'],['pending','待处理'],['confirmed','已确认'],['shipped','已发货'],['delivered','已送达'],['cancelled','已取消']].map(([k,l]) => (
          <button
            key={k}
            onClick={() => setFilterStatus(k)}
            className="flex-shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: filterStatus === k ? '#FF6900' : '#fff',
              color: filterStatus === k ? '#fff' : '#6b7280',
              borderColor: filterStatus === k ? '#FF6900' : '#e5e7eb',
            }}
          >{l}</button>
        ))}
      </div>
      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16 text-gray-300 text-[13px]">暂无团队订单</div>
      ) : (
        <div className="space-y-2">
          {(filtered as any[]).map((o: any) => (
            <div key={o.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-black truncate">{o.recipeName || '定制米'}</p>
                  <p className="text-[11px] text-gray-400">#{o.id} · {o.receiverName}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[o.status] ?? 'text-gray-500 bg-gray-100'}`}>
                  {ORDER_STATUS_OPTIONS.find(s => s.value === o.status)?.label ?? o.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400">成员：{o.memberName ?? '未知'}</p>
                <span className="text-[13px] font-bold" style={{ color: '#FF6900' }}>￥{Number(o.totalPrice).toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-gray-300 mt-1">{new Date(o.createdAt).toLocaleDateString('zh-CN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UnifiedAdmin() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const username = (user as any)?.username as string ?? "";
  const mibanRole = (user as any)?.mibanRole as string ?? "baby";
  const isMibanAdmin = username === "jiang";
  const isMibanAgent = mibanRole === "parent";

  // 权限检查
  if (!isAuthenticated) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-[14px] text-gray-400 mb-4">请先登录</p>
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="text-[13px] font-semibold" style={{ color: "#FF6900" }}>返回首页</button>
        </div>
      </div>
    );
  }

  if (!isMibanAdmin && !isMibanAgent) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-[14px] text-gray-400 mb-4">此页面仅限管理员或销售团队访问</p>
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="text-[13px] font-semibold" style={{ color: "#FF6900" }}>返回首页</button>
        </div>
      </div>
    );
  }

  const isAdmin = isMibanAdmin;

  // 管理员标签
  const adminTabs: Array<{ key: AdminTabKey; label: string }> = isAdmin ? [
    { key: "orders",    label: "订单管理" },
    { key: "pending",   label: "待结算" },
    { key: "aftersale", label: "售后" },
    { key: "rice",      label: "米库管理" },
    { key: "inventory", label: "库存管理" },
    { key: "users",     label: "用户管理" },
    { key: "teamManage", label: "团队管理" },
  ] : [
    // 业务员/团队长标签
    { key: "team",       label: "团队业绩" },
    { key: "teamOrders", label: "团队订单" },
    { key: "commission", label: "我的佣金" },
    { key: "referrals",  label: "我的推荐" },
  ];

  const defaultTab = adminTabs[0].key;
  const [activeTab, setActiveTab] = useState<AdminTabKey>(defaultTab);

  return (
    <div className="bg-[#F8F6F3] min-h-screen">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:scale-95 transition-transform flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-bold text-black">
              {isAdmin ? "管理中心" : "销售中心"}
            </h1>
            <p className="text-[11px] text-gray-400">
              {isAdmin ? "米伴平台运营管理" : "我的销售数据"}
            </p>
          </div>
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${isAdmin ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
            {isAdmin ? "管理员" : "销售"}
          </span>
        </div>

        {/* Tab 标签栏：均分一屏，不滚动 */}
        <div className="flex -mx-4">
          {adminTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2.5 text-[11px] font-semibold transition-all border-b-2"
              style={{
                color: activeTab === tab.key ? "#FF6900" : "#888",
                borderBottomColor: activeTab === tab.key ? "#FF6900" : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="px-4 py-4 pb-24">
        {activeTab === "orders"    && <OrdersPanel />}
        {activeTab === "pending"    && <PendingCommissionsPanel />}
        {activeTab === "aftersale" && <AftersalePanel />}
        {activeTab === "rice"      && <RicePanel />}
        {activeTab === "inventory" && <InventoryPanel />}
        {activeTab === "warehouse" && <WarehousePanel />}
        {activeTab === "users"     && <UsersPanel />}
        {activeTab === "teamManage" && <SalesPanel />}
        {/* 业务员视图 */}
        {(activeTab === "team" || activeTab === "commission" || activeTab === "referrals") && <AgentTeamPanel />}
        {activeTab === "teamOrders" && <TeamOrdersPanel />}
      </div>
    </div>
  );
}
