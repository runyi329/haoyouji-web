import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Trash2, Pencil, Users, ArrowLeftRight, Search, X, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LedgerEquityManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 59;

  // 获取账本成员
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });
  // 获取所有股权记录
  const { data: shares, refetch: refetchShares } = trpc.equity.getLedgerShares.useQuery({ ledgerId });

  // 生成6位股权登记编号（大写字母+数字混合）
  const genRegNo = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  // ── 筛选状态 ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterUser, setFilterUser] = useState('');       // 用户名/昵称关键字
  const [filterCode, setFilterCode] = useState('');       // 股权编号关键字
  const [filterType, setFilterType] = useState('');       // 股票类型：'' | '资金股' | '资源股'
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAmountMin, setFilterAmountMin] = useState('');
  const [filterAmountMax, setFilterAmountMax] = useState('');

  // ── 筛选逻辑 ──
  const filteredShares = useMemo(() => {
    if (!shares) return [];
    return (shares as any[]).filter(s => {
      if (filterUser) {
        const kw = filterUser.toLowerCase();
        const name = (s.memberNickname || '').toLowerCase();
        if (!name.includes(kw)) return false;
      }
      if (filterCode) {
        const kw = filterCode.toLowerCase();
        const code = (s.share_code || s.regNo || '').toLowerCase();
        if (!code.includes(kw)) return false;
      }
      if (filterType && s.shareType !== filterType) return false;
      if (filterDateFrom && s.grantDate) {
        const d = formatDate(s.grantDate);
        if (d < filterDateFrom) return false;
      }
      if (filterDateTo && s.grantDate) {
        const d = formatDate(s.grantDate);
        if (d > filterDateTo) return false;
      }
      if (filterAmountMin && Number(s.shareCount) < Number(filterAmountMin)) return false;
      if (filterAmountMax && Number(s.shareCount) > Number(filterAmountMax)) return false;
      return true;
    });
  }, [shares, filterUser, filterCode, filterType, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  const hasFilter = filterUser || filterCode || filterType || filterDateFrom || filterDateTo || filterAmountMin || filterAmountMax;

  const clearFilters = () => {
    setFilterUser(''); setFilterCode(''); setFilterType('');
    setFilterDateFrom(''); setFilterDateTo('');
    setFilterAmountMin(''); setFilterAmountMax('');
  };

  // 添加股权弹窗状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    userId: 0,
    memberNickname: "",
    shareCount: "",
    shareType: "资金股",
    grantDate: new Date().toISOString().slice(0, 10),
    reason: "",
    regNo: genRegNo(),
    annualRate: "6",
  });

  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    shareCount: "",
    shareType: "资金股",
    grantDate: "",
    reason: "",
    annualRate: "6",
  });

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // 股权转让弹窗状态
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromShareId: 0,
    toUserId: 0,
    toUserNickname: '',
    shareCount: '',
    toShareType: '资金股',
    reason: '',
  });

  const addMutation = trpc.equity.addLedgerShare.useMutation({
    onSuccess: () => {
      toast.success("股权记录已添加");
      setShowAddDialog(false);
      setAddForm({ userId: 0, memberNickname: "", shareCount: "", shareType: "资金股", grantDate: new Date().toISOString().slice(0, 10), reason: "", regNo: genRegNo(), annualRate: "6" });
      refetchShares();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateMutation = trpc.equity.updateEquityShare.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      setEditTarget(null);
      refetchShares();
    },
    onError: (e) => toast.error(e.message || "更新失败"),
  });

  const deleteMutation = trpc.equity.deleteLedgerShare.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
      refetchShares();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const transferMutation = trpc.equityTransfer.createTransfer.useMutation({
    onSuccess: () => {
      toast.success('转让申请已提交，等待管理员审批');
      setShowTransferDialog(false);
      setTransferForm({ fromShareId: 0, toUserId: 0, toUserNickname: '', shareCount: '', toShareType: '资金股', reason: '' });
    },
    onError: (e) => toast.error(e.message || '转让申请失败'),
  });

  const handleTransfer = () => {
    if (!transferForm.fromShareId) { toast.error('请选择转出的股权记录'); return; }
    if (!transferForm.toUserId) { toast.error('请选择转入方'); return; }
    const cnt = Number(transferForm.shareCount);
    if (!transferForm.shareCount || isNaN(cnt) || cnt <= 0) { toast.error('请输入有效的转让张数'); return; }
    transferMutation.mutate({
      ledgerId,
      fromShareId: transferForm.fromShareId,
      toUserId: transferForm.toUserId,
      toUserNickname: transferForm.toUserNickname,
      fromShareCount: cnt,
      toShareType: transferForm.toShareType,
      reason: transferForm.reason.trim(),
    });
  };

  const handleAdd = () => {
    if (!addForm.userId) { toast.error("请选择成员"); return; }
    if (!addForm.shareCount || isNaN(Number(addForm.shareCount)) || Number(addForm.shareCount) <= 0) {
      toast.error("请输入有效的股票张数"); return;
    }
    if (!addForm.grantDate) { toast.error("请选择获得日期"); return; }
    addMutation.mutate({
      ledgerId,
      userId: addForm.userId,
      memberNickname: addForm.memberNickname,
      shareCount: Number(addForm.shareCount),
      shareType: addForm.shareType || '资金股',
      grantDate: addForm.grantDate,
      reason: addForm.reason.trim(),
      regNo: addForm.regNo.trim() || undefined,
    });
  };

  const openEdit = (record: any) => {
    setEditTarget(record);
    setEditForm({
      shareCount: String(record.shareCount),
      shareType: record.shareType || '资金股',
      grantDate: formatDate(record.grantDate),
      reason: record.reason || "",
      annualRate: String(record.annualRate ?? 6),
    });
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    if (!editForm.shareCount || isNaN(Number(editForm.shareCount)) || Number(editForm.shareCount) <= 0) {
      toast.error("请输入有效的股票张数"); return;
    }
    const rate = Number(editForm.annualRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("年化股息率须在0-100之间"); return;
    }
    updateMutation.mutate({
      id: editTarget.id,
      ledgerId,
      shareCount: Number(editForm.shareCount),
      shareType: editForm.shareType,
      grantDate: editForm.grantDate,
      reason: editForm.reason.trim(),
      annualRate: rate,
    });
  };

  const formatDate = (d: string | Date) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  const inputStyle = { width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box' as const, outline: 'none' };
  const labelStyle = { fontSize: '12px', color: '#6b7280', marginBottom: '4px' };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">股权管理</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowTransferDialog(true)} className="p-2" title="发起转让">
              <ArrowLeftRight className="w-5 h-5 text-gray-500" />
            </button>
            <button onClick={() => setShowAddDialog(true)} className="p-2" title="添加股权">
              <Plus className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户名 / 股权编号..."
              value={filterUser || filterCode}
              onChange={(e) => {
                const v = e.target.value;
                // 如果像编号格式（含-或全大写）则走编号搜索，否则走用户名
                if (v.includes('-') || /^[A-Z0-9]+$/.test(v)) {
                  setFilterCode(v); setFilterUser('');
                } else {
                  setFilterUser(v); setFilterCode('');
                }
              }}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '7px 12px 7px 34px', fontSize: '13px', background: '#f9fafb', color: '#1f2937', outline: 'none', boxSizing: 'border-box' }}
            />
            {(filterUser || filterCode) && (
              <button onClick={() => { setFilterUser(''); setFilterCode(''); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFilterOpen(v => !v)}
            style={{ flexShrink: 0, border: `1px solid ${hasFilter ? '#D32F2F' : '#e5e7eb'}`, borderRadius: '20px', padding: '7px 12px', fontSize: '12px', background: hasFilter ? '#fff0f0' : '#f9fafb', color: hasFilter ? '#D32F2F' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          >
            <Filter className="w-3.5 h-3.5" />
            筛选{hasFilter ? ' ·' : ''}
          </button>
        </div>

        {/* 高级筛选展开区 */}
        {filterOpen && (
          <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div style={labelStyle}>股票类型</div>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }}>
                  <option value="">全部类型</option>
                  <option value="资金股">资金股</option>
                  <option value="资源股">资源股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>张数范围（张）</div>
                <div className="flex items-center gap-1">
                  <input type="number" placeholder="最小" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>-</span>
                  <input type="number" placeholder="最大" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div style={labelStyle}>开始日期</div>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} />
              </div>
              <div>
                <div style={labelStyle}>结束日期</div>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} />
              </div>
            </div>
            {hasFilter && (
              <button onClick={clearFilters} style={{ fontSize: '12px', color: '#D32F2F', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                清除所有筛选条件
              </button>
            )}
          </div>
        )}

        {/* 结果统计 */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            共 {filteredShares.length} 条记录
            {hasFilter && ` （已筛选，共 ${(shares || []).length} 条）`}
          </span>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            合计 {filteredShares.reduce((sum, s) => sum + Number(s.shareCount), 0).toLocaleString()} 张
          </span>
        </div>
      </div>

      {/* 股权卡片列表 */}
      <div className="px-4 pt-3 space-y-3">
        {filteredShares.length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-16">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <div>{hasFilter ? '没有符合条件的记录' : '暂无股权记录'}</div>
            {!hasFilter && <div className="mt-1 text-xs">点击右上角 + 为成员添加股权</div>}
          </div>
        ) : (
          filteredShares.map((record: any) => (
            <div key={record.id} style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              {/* 卡片顶部：用户信息 + 类型标签 */}
              <div style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>
                    {(record.memberNickname || '?').charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{record.memberNickname}</div>
                    {record.shareNo && <div style={{ fontSize: '10px', color: '#9ca3af' }}>股东编号 {record.shareNo}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: record.shareType === '资金股' ? '#dbeafe' : '#dcfce7', color: record.shareType === '资金股' ? '#1d4ed8' : '#15803d', fontWeight: 500 }}>
                    {record.shareType}
                  </span>
                  <button onClick={() => openEdit(record)} style={{ padding: '4px', color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Pencil style={{ width: '14px', height: '14px' }} />
                  </button>
                  <button onClick={() => setDeleteTarget({ id: record.id, name: `${record.memberNickname} ${Number(record.shareCount)}张` })} style={{ padding: '4px', color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              </div>

              {/* 卡片主体：核心数据 */}
              <div style={{ padding: '12px 14px' }}>
                {/* 张数 + 日期 */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>{Number(record.shareCount).toLocaleString()}</span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>张</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>{formatDate(record.grantDate)}</span>
                </div>

                {/* 编号行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  {record.share_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>股权编号</span>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: '#374151', letterSpacing: '0.05em', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>{record.share_code}</span>
                    </div>
                  )}
                  {record.regNo && !record.share_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>登记编号</span>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af', letterSpacing: '1px' }}>{record.regNo}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>年化</span>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#f59e0b' }}>{record.annualRate ?? 6}%</span>
                  </div>
                </div>

                {/* 备注（含来源信息整合） */}
                {(record.reason || (record.shareType === '资源股' && (record.sourceNickname || record.source_user_id))) && (
                  <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.5', background: '#fafafa', borderRadius: '6px', padding: '5px 8px' }}>
                    {record.reason}
                    {record.shareType === '资源股' && (record.sourceNickname || record.source_user_id) && (
                      <span style={{ color: '#15803d' }}>
                        {record.reason ? '　·　' : ''}来源：{record.sourceNickname || `用户#${record.source_user_id}`}{record.source_amount ? ` 购入 ${Number(record.source_amount).toLocaleString()} 张` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 <strong>{deleteTarget?.name}</strong> 的股权记录，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, ledgerId })}
              className="bg-red-600 hover:bg-red-700"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加股权弹窗 */}
      {showAddDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false); }}
        >
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '16px' }}>添加股权记录</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={labelStyle}>选择成员</div>
                <select style={inputStyle} value={addForm.userId} onChange={(e) => {
                  const uid = Number(e.target.value);
                  const m = (members || []).find((mb: any) => mb.userId === uid);
                  setAddForm(f => ({ ...f, userId: uid, memberNickname: m?.nickname || m?.username || "" }));
                }}>
                  <option value={0}>请选择成员</option>
                  {(members || []).map((m: any) => (
                    <option key={m.userId} value={m.userId}>{m.nickname || m.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>股票张数</div>
                <input type="number" placeholder="请输入张数（如 100000）" value={addForm.shareCount}
                  onChange={(e) => setAddForm(f => ({ ...f, shareCount: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>股权类型</div>
                <select value={addForm.shareType} onChange={(e) => setAddForm(f => ({ ...f, shareType: e.target.value }))} style={inputStyle}>
                  <option value="资金股">资金股</option>
                  <option value="资源股">资源股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>年化股息率（%）</div>
                <input type="number" step="0.01" min="0" max="100" placeholder="默认 6" value={addForm.annualRate}
                  onChange={(e) => setAddForm(f => ({ ...f, annualRate: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>获得日期</div>
                <input type="date" value={addForm.grantDate} onChange={(e) => setAddForm(f => ({ ...f, grantDate: e.target.value }))}
                  style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none' } as any} />
              </div>
              <div>
                <div style={labelStyle}>股权登记编号</div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '15px', background: '#f9fafb', color: '#374151', fontFamily: 'monospace', letterSpacing: '3px', fontWeight: 600 }}>{addForm.regNo}</div>
              </div>
              <div>
                <div style={labelStyle}>备注</div>
                <textarea rows={2} placeholder="备注（可不填）" value={addForm.reason}
                  onChange={(e) => setAddForm(f => ({ ...f, reason: e.target.value }))}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowAddDialog(false)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#fff', color: '#374151', cursor: 'pointer' }}>取消</button>
              <button onClick={handleAdd} disabled={addMutation.isPending}
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#D32F2F', color: '#fff', cursor: 'pointer', opacity: addMutation.isPending ? 0.7 : 1 }}>
                {addMutation.isPending ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑股权弹窗 */}
      {editTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
        >
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>编辑股权记录</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
              {editTarget.share_code ? `股权编号: ${editTarget.share_code}` : `登记编号: ${editTarget.regNo}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={labelStyle}>股票张数</div>
                <input type="number" value={editForm.shareCount}
                  onChange={(e) => setEditForm(f => ({ ...f, shareCount: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>股权类型</div>
                <select value={editForm.shareType} onChange={(e) => setEditForm(f => ({ ...f, shareType: e.target.value }))} style={inputStyle}>
                  <option value="资金股">资金股</option>
                  <option value="资源股">资源股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>年化股息率（%）</div>
                <input type="number" step="0.01" min="0" max="100" value={editForm.annualRate}
                  onChange={(e) => setEditForm(f => ({ ...f, annualRate: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>获得日期</div>
                <input type="date" value={editForm.grantDate} onChange={(e) => setEditForm(f => ({ ...f, grantDate: e.target.value }))}
                  style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none' } as any} />
              </div>
              <div>
                <div style={labelStyle}>备注</div>
                <textarea rows={2} value={editForm.reason}
                  onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setEditTarget(null)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#fff', color: '#374151', cursor: 'pointer' }}>取消</button>
              <button onClick={handleUpdate} disabled={updateMutation.isPending}
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#D32F2F', color: '#fff', cursor: 'pointer', opacity: updateMutation.isPending ? 0.7 : 1 }}>
                {updateMutation.isPending ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 股权转让弹窗 */}
      {showTransferDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTransferDialog(false); }}
        >
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '16px' }}>股权转让</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={labelStyle}>转出股权记录</div>
                <select style={inputStyle} value={transferForm.fromShareId} onChange={(e) => setTransferForm(f => ({ ...f, fromShareId: Number(e.target.value) }))}>
                  <option value={0}>请选择转出记录</option>
                  {(shares || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.memberNickname} - {Number(s.shareCount).toLocaleString()}张 ({s.shareType}) {s.share_code || s.regNo || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>转入方</div>
                <select style={inputStyle} value={transferForm.toUserId} onChange={(e) => {
                  const uid = Number(e.target.value);
                  const m = (members || []).find((mb: any) => mb.userId === uid);
                  setTransferForm(f => ({ ...f, toUserId: uid, toUserNickname: m?.nickname || m?.username || '' }));
                }}>
                  <option value={0}>请选择转入方</option>
                  {(members || []).map((m: any) => (
                    <option key={m.userId} value={m.userId}>{m.nickname || m.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>转让张数</div>
                <input type="number" placeholder="请输入转让张数" value={transferForm.shareCount}
                  onChange={(e) => setTransferForm(f => ({ ...f, shareCount: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>转入股权类型</div>
                <select value={transferForm.toShareType} onChange={(e) => setTransferForm(f => ({ ...f, toShareType: e.target.value }))} style={inputStyle}>
                  <option value="资金股">资金股</option>
                  <option value="资源股">资源股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>转让原因</div>
                <textarea rows={2} placeholder="转让原因（可不填）" value={transferForm.reason}
                  onChange={(e) => setTransferForm(f => ({ ...f, reason: e.target.value }))}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowTransferDialog(false)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#fff', color: '#374151', cursor: 'pointer' }}>取消</button>
              <button onClick={handleTransfer} disabled={transferMutation.isPending}
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#D32F2F', color: '#fff', cursor: 'pointer', opacity: transferMutation.isPending ? 0.7 : 1 }}>
                {transferMutation.isPending ? "提交中..." : "提交转让"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
