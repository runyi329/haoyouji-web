import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Trash2, Pencil, Users, ArrowLeftRight } from "lucide-react";
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

  // 添加股权弹窗状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    userId: 0,
    memberNickname: "",
    shareCount: "",
    shareType: "天使股",
    grantDate: new Date().toISOString().slice(0, 10),
    reason: "",
    regNo: genRegNo(),
    annualRate: "6",
  });

  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    shareCount: "",
    shareType: "天使股",
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
    toShareType: '天使股',
    reason: '',
  });

  const addMutation = trpc.equity.addLedgerShare.useMutation({
    onSuccess: () => {
      toast.success("股权记录已添加");
      setShowAddDialog(false);
      setAddForm({ userId: 0, memberNickname: "", shareCount: "", shareType: "天使股", grantDate: new Date().toISOString().slice(0, 10), reason: "", regNo: genRegNo(), annualRate: "6" });
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
      setTransferForm({ fromShareId: 0, toUserId: 0, toUserNickname: '', shareCount: '', toShareType: '天使股', reason: '' });
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
      shareType: addForm.shareType || '天使股',
      grantDate: addForm.grantDate,
      reason: addForm.reason.trim(),
      regNo: addForm.regNo.trim() || undefined,
    });
  };

  const openEdit = (record: any) => {
    setEditTarget(record);
    setEditForm({
      shareCount: String(record.shareCount),
      shareType: record.shareType || '天使股',
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

  // 按成员分组统计
  const memberShareMap: Record<number, { nickname: string; total: number; records: any[] }> = {};
  (shares || []).forEach((s: any) => {
    if (!memberShareMap[s.userId]) {
      memberShareMap[s.userId] = { nickname: s.memberNickname, total: 0, records: [] };
    }
    memberShareMap[s.userId].total += Number(s.shareCount);
    memberShareMap[s.userId].records.push(s);
  });

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
              <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            </button>
            <button onClick={() => setShowAddDialog(true)} className="p-2 -mr-2">
              <Plus className="w-6 h-6 text-blue-600" />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-4 space-y-4">
        {Object.keys(memberShareMap).length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-16">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <div>暂无股权记录</div>
            <div className="mt-1 text-xs">点击右上角 + 为成员添加股权</div>
          </div>
        ) : (
          Object.entries(memberShareMap).map(([uid, info]) => (
            <div key={uid} className="bg-white rounded-xl overflow-hidden shadow-sm">
              {/* 成员标题行 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {info.nickname.charAt(0)}
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">{info.nickname}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">累计持有</div>
                  <div className="text-base font-bold text-blue-600">{info.total.toLocaleString()} 张</div>
                </div>
              </div>
              {/* 股权卡片列表 */}
              <div className="divide-y divide-gray-50">
                {info.records.map((record: any) => (
                  <div key={record.id} className="px-4 py-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-bold text-gray-900">{Number(record.shareCount).toLocaleString()} 张</span>
                        {record.shareType && (
                          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 500 }}>{record.shareType}</span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(record.grantDate)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {record.regNo && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', letterSpacing: '1px' }}>编号: {record.regNo}</div>}
                        <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 500 }}>年化 {record.annualRate ?? 6}%</div>
                      </div>
                      {record.reason && <div className="text-xs text-gray-500 leading-relaxed mt-0.5">{record.reason}</div>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => openEdit(record)}
                        className="p-1.5 text-gray-300 hover:text-blue-400"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: record.id, name: `${info.nickname} ${Number(record.shareCount)}张` })}
                        className="p-1.5 text-gray-300 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

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
                  <option value="天使股">天使股</option>
                  <option value="市场贡献股">市场贡献股</option>
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
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>登记编号: {editTarget.regNo}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={labelStyle}>股票张数</div>
                <input type="number" value={editForm.shareCount}
                  onChange={(e) => setEditForm(f => ({ ...f, shareCount: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>股权类型</div>
                <select value={editForm.shareType} onChange={(e) => setEditForm(f => ({ ...f, shareType: e.target.value }))} style={inputStyle}>
                  <option value="天使股">天使股</option>
                  <option value="市场贡献股">市场贡献股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>年化股息率（%）</div>
                <input type="number" step="0.01" min="0" max="100" value={editForm.annualRate}
                  onChange={(e) => setEditForm(f => ({ ...f, annualRate: e.target.value }))} style={inputStyle} />
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>每秒增加：{((Number(editForm.shareCount || 0) * Number(editForm.annualRate || 0) / 100) / 31536000).toFixed(8)} 张</div>
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
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#1d4ed8', color: '#fff', cursor: 'pointer', opacity: updateMutation.isPending ? 0.7 : 1 }}>
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
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>股权转让申请</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>提交后由管理员审批后生效</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={labelStyle}>转出方（选择股权记录）</div>
                <select style={inputStyle} value={transferForm.fromShareId} onChange={(e) => setTransferForm(f => ({ ...f, fromShareId: Number(e.target.value) }))}>
                  <option value={0}>请选择要转出的股权</option>
                  {(shares || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.memberNickname} - {Number(s.shareCount).toLocaleString()}张 {s.shareType}
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
                <div style={labelStyle}>转入后股权类型</div>
                <select value={transferForm.toShareType} onChange={(e) => setTransferForm(f => ({ ...f, toShareType: e.target.value }))} style={inputStyle}>
                  <option value="天使股">天使股</option>
                  <option value="市场贡献股">市场贡献股</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>转让原因（可不填）</div>
                <textarea rows={2} placeholder="备注" value={transferForm.reason}
                  onChange={(e) => setTransferForm(f => ({ ...f, reason: e.target.value }))}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowTransferDialog(false)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#fff', color: '#374151', cursor: 'pointer' }}>取消</button>
              <button onClick={handleTransfer} disabled={transferMutation.isPending}
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#D97706', color: '#fff', cursor: 'pointer', opacity: transferMutation.isPending ? 0.7 : 1 }}>
                {transferMutation.isPending ? '提交中...' : '提交转让申请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」的股权记录吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, ledgerId })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
