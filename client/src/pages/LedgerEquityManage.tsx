import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Trash2, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
  });

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const utils = trpc.useUtils();

  const addMutation = trpc.equity.addLedgerShare.useMutation({
    onSuccess: () => {
      toast.success("股权记录已添加");
      setShowAddDialog(false);
      setAddForm({ userId: 0, memberNickname: "", shareCount: "", shareType: "天使股", grantDate: new Date().toISOString().slice(0, 10), reason: "", regNo: genRegNo() });
      refetchShares();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const deleteMutation = trpc.equity.deleteLedgerShare.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
      refetchShares();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

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

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">股权管理</h1>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-2 -mr-2"
          >
            <Plus className="w-6 h-6 text-blue-600" />
          </button>
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
                          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: record.shareType === '天使股' ? '#dbeafe' : '#dcfce7', color: record.shareType === '天使股' ? '#1d4ed8' : '#15803d', fontWeight: 500 }}>{record.shareType}</span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(record.grantDate)}</span>
                      </div>
                      {record.regNo && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', letterSpacing: '1px', marginTop: '2px' }}>登记编号: {record.regNo}</div>}
                      {record.reason && <div className="text-xs text-gray-500 leading-relaxed">{record.reason}</div>}
                    </div>
                    <button
                      onClick={() => setDeleteTarget({ id: record.id, name: `${info.nickname} ${Number(record.shareCount)}张` })}
                      className="p-1.5 text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加股权弹窗 - 自定义全屏遗罩层，手机端完全居中 */}
      {showAddDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false); }}
        >
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '16px' }}>添加股权记录</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 选择成员 */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>选择成员</div>
                <select
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box' }}
                  value={addForm.userId}
                  onChange={(e) => {
                    const uid = Number(e.target.value);
                    const m = (members || []).find((mb: any) => mb.userId === uid);
                    setAddForm(f => ({ ...f, userId: uid, memberNickname: m?.nickname || m?.username || "" }));
                  }}
                >
                  <option value={0}>请选择成员</option>
                  {(members || []).map((m: any) => (
                    <option key={m.userId} value={m.userId}>{m.nickname || m.username}</option>
                  ))}
                </select>
              </div>
              {/* 股票张数 */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>股票张数</div>
                <input
                  type="number"
                  placeholder="请输入张数（如 100）"
                  value={addForm.shareCount}
                  onChange={(e) => setAddForm(f => ({ ...f, shareCount: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              {/* 股权类型 */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>股权类型</div>
                <select
                  value={addForm.shareType}
                  onChange={(e) => setAddForm(f => ({ ...f, shareType: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box' }}
                >
                  <option value="天使股">天使股</option>
                  <option value="市场贡献">市场贡献</option>
                </select>
              </div>
              {/* 获得日期 */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>获得日期</div>
                <input
                  type="date"
                  value={addForm.grantDate}
                  onChange={(e) => setAddForm(f => ({ ...f, grantDate: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box', outline: 'none', WebkitAppearance: 'none', appearance: 'none' }}
                />
              </div>
              {/* 股权登记编号（自动生成，只读） */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>股权登记编号</div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '15px', background: '#f9fafb', color: '#374151', fontFamily: 'monospace', letterSpacing: '3px', fontWeight: 600 }}>{addForm.regNo}</div>
              </div>
              {/* 备注 */}
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>备注</div>
                <textarea
                  rows={2}
                  placeholder="备注（可不填）"
                  value={addForm.reason}
                  onChange={(e) => setAddForm(f => ({ ...f, reason: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#fff', color: '#1f2937', boxSizing: 'border-box', resize: 'none', outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setShowAddDialog(false)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#fff', color: '#374151', cursor: 'pointer' }}
              >取消</button>
              <button
                onClick={handleAdd}
                disabled={addMutation.isPending}
                style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', background: '#D32F2F', color: '#fff', cursor: 'pointer', opacity: addMutation.isPending ? 0.7 : 1 }}
              >{addMutation.isPending ? "添加中..." : "确认添加"}</button>
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
