import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface Props {
  ledgerId: number;
  userId: number;
  nickname: string;
  isAdmin: boolean;
  onClose: () => void;
  onViewUser: (uid: number) => void;
  membersData: any[];
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  grant: { label: "授予", color: "#C9A84C" },
  transfer_in: { label: "转入", color: "#4CAF50" },
  transfer_out_approved: { label: "转出(已批准)", color: "#F44336" },
  transfer_out_pending: { label: "转出(待审核)", color: "#FF9800" },
  transfer_out_rejected: { label: "转出(已拒绝)", color: "#9E9E9E" },
};

// 权重编辑弹窗（管理员修改单张订单权重）
function EditWeightModal({
  share,
  ledgerId,
  onClose,
  onSuccess,
}: {
  share: any;
  ledgerId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rw, setRw] = useState(String(Number(share.resourceWeight ?? 1.0).toFixed(2)));
  const [cw, setCw] = useState(String(Number(share.capitalWeight ?? 1.0).toFixed(2)));
  const [err, setErr] = useState('');

  const updateMutation = trpc.equity.updateShareWeight.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (e: any) => setErr(e.message || '操作失败'),
  });

  const handleSave = () => {
    const rv = parseFloat(rw);
    const cv = parseFloat(cw);
    if (isNaN(rv) || rv <= 0 || rv > 100) { setErr('资源权重需在 0.01 ~ 100 之间'); return; }
    if (isNaN(cv) || cv <= 0 || cv > 100) { setErr('资金权重需在 0.01 ~ 100 之间'); return; }
    setErr('');
    updateMutation.mutate({ id: share.shareId, ledgerId, resourceWeight: rv, capitalWeight: cv });
  };

  const totalW = (parseFloat(rw) || 0) * (parseFloat(cw) || 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-80 rounded-2xl px-5 py-5"
        style={{ background: 'linear-gradient(160deg, #0D0D00 0%, #1A1600 100%)', border: '1px solid #C9A84C' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold" style={{ color: '#F0D060' }}>修改订单权重</span>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: '#C9A84C' }}>×</button>
        </div>
        <div className="text-xs mb-3" style={{ color: 'rgba(201,168,76,0.55)' }}>
          仅修改此笔订单权重，不影响其他订单
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'rgba(201,168,76,0.7)' }}>资源权重</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={rw}
              onChange={e => setRw(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', color: '#F0D060', outline: 'none' }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'rgba(201,168,76,0.7)' }}>资金权重</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={cw}
              onChange={e => setCw(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', color: '#F0D060', outline: 'none' }}
            />
          </div>
          <div className="text-xs text-center" style={{ color: 'rgba(201,168,76,0.55)' }}>
            合计权重：{isNaN(totalW) ? '-' : totalW.toFixed(4)}
          </div>
        </div>
        {err && <div className="text-xs mt-2 text-center" style={{ color: '#F44336' }}>{err}</div>}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(201,168,76,0.1)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #F0D060)', color: '#0D0D00' }}
          >
            {updateMutation.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EquityHistoryModal({ ledgerId, userId, nickname, isAdmin, onClose, onViewUser, membersData }: Props) {
  const [tab, setTab] = useState<'history' | 'pending'>('history');
  const [searchUser, setSearchUser] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [editingShare, setEditingShare] = useState<any | null>(null);

  const utils = trpc.useUtils();

  // 查询流水
  const { data: myHistory, isLoading: histLoading, refetch: refetchMyHistory } = trpc.equityTransfer.getMyEquityHistory.useQuery(
    { ledgerId },
    { enabled: !isAdmin || userId === 0 }
  );
  const { data: userHistory, isLoading: userHistLoading, refetch: refetchUserHistory } = trpc.equityTransfer.getUserEquityHistory.useQuery(
    { ledgerId, userId },
    { enabled: isAdmin && userId > 0 }
  );
  const history = isAdmin && userId > 0 ? userHistory : myHistory;
  const historyLoading = isAdmin && userId > 0 ? userHistLoading : histLoading;

  // 待审核转让（管理员）
  const { data: pendingList, isLoading: pendingLoading, refetch: refetchPending } = trpc.equityTransfer.getPendingTransfers.useQuery(
    { ledgerId },
    { enabled: isAdmin }
  );

  const reviewMutation = trpc.equityTransfer.reviewTransfer.useMutation({
    onSuccess: () => { refetchPending(); },
  });

  const filteredMembers = membersData?.filter((m: any) => {
    const name = m.nickname || m.username || '';
    return name.includes(searchUser);
  }) ?? [];

  const formatDate = (d: any) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return '-'; }
  };

  const handleWeightSaved = () => {
    // 刷新流水数据
    if (isAdmin && userId > 0) {
      refetchUserHistory();
    } else {
      refetchMyHistory();
    }
    // 同时刷新股权相关查询
    utils.equity.getMemberShares.invalidate();
    utils.equity.getGlobalShareStats.invalidate();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-t-2xl flex flex-col"
        style={{ background: 'linear-gradient(160deg, #0D0D00 0%, #1A1600 40%, #0D0D00 100%)', border: '1px solid #C9A84C', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold" style={{ color: '#F0D060' }}>股权流水</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>{nickname}</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowUserPicker(true)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.4)' }}
              >
                切换成员
              </button>
            )}
            <button onClick={onClose} className="text-xl" style={{ color: '#C9A84C' }}>×</button>
          </div>
        </div>

        {/* Tab */}
        {isAdmin && (
          <div
            className="flex px-4 pt-3 pb-3 gap-3"
            style={{ borderBottom: '1px solid rgba(201,168,76,0.2)', flexShrink: 0 }}
          >
            {(['history', 'pending'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-sm px-4 py-2 rounded-full font-medium"
                style={tab === t
                  ? { background: 'linear-gradient(135deg, #C9A84C, #F0D060)', color: '#0D0D00', flexShrink: 0 }
                  : { background: 'rgba(201,168,76,0.1)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)', flexShrink: 0 }}
              >
                {t === 'history' ? '流水记录' : `待审批${pendingList?.length ? ` (${pendingList.length})` : ''}`}
              </button>
            ))}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {tab === 'history' && (
            <>
              {historyLoading && (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(201,168,76,0.5)' }}>加载中...</div>
              )}
              {!historyLoading && (!history || history.length === 0) && (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(201,168,76,0.5)' }}>暂无股权流水记录</div>
              )}
              {history?.map((item: any, idx: number) => {
                const evInfo = EVENT_LABELS[item.eventType] || { label: item.eventType, color: '#888' };
                const canEditWeight = isAdmin && item.eventType === 'grant' && item.shareId;
                return (
                  <div
                    key={idx}
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${evInfo.color}22`, color: evInfo.color }}>
                        {evInfo.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {canEditWeight && (
                          <button
                            onClick={() => setEditingShare(item)}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(201,168,76,0.12)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.35)' }}
                          >
                            编辑权重
                          </button>
                        )}
                        <span className="text-xs" style={{ color: 'rgba(201,168,76,0.5)' }}>{formatDate(item.eventDate || item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: '#F0D060' }}>
                        {item.eventType.startsWith('transfer_out') ? '-' : '+'}{Number(item.shareCount).toLocaleString()} 张
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(201,168,76,0.7)' }}>{item.shareType}</span>
                    </div>
                    {/* 权重信息（仅授予类型显示） */}
                    {item.eventType === 'grant' && (item.resourceWeight != null || item.capitalWeight != null) && (
                      <div className="text-xs mt-1" style={{ color: 'rgba(201,168,76,0.45)' }}>
                        权重：{Number(item.resourceWeight ?? 1).toFixed(2)} × {Number(item.capitalWeight ?? 1).toFixed(2)} = {(Number(item.resourceWeight ?? 1) * Number(item.capitalWeight ?? 1)).toFixed(4)}
                      </div>
                    )}
                    {item.counterparty && (
                      <div className="text-xs mt-1" style={{ color: 'rgba(201,168,76,0.55)' }}>
                        {item.eventType === 'transfer_in' ? '来自' : '转给'}：{item.counterparty}
                      </div>
                    )}
                    {item.reason && (
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(201,168,76,0.45)' }}>{item.reason}</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'pending' && isAdmin && (
            <>
              {pendingLoading && (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(201,168,76,0.5)' }}>加载中...</div>
              )}
              {!pendingLoading && (!pendingList || pendingList.length === 0) && (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(201,168,76,0.5)' }}>暂无待审批的转让申请</div>
              )}
              {pendingList?.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-xl px-3 py-3"
                  style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: '#F0D060' }}>
                      {item.fromNickname} → {item.toNickname}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(201,168,76,0.5)' }}>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="text-xs mb-1" style={{ color: 'rgba(201,168,76,0.7)' }}>
                    转让 {Number(item.fromShareCount).toLocaleString()} 张 {item.fromShareType}
                    {item.fromShareType !== item.toShareType && ` → ${item.toShareType}`}
                  </div>
                  {item.reason && (
                    <div className="text-xs mb-2" style={{ color: 'rgba(201,168,76,0.5)' }}>原因：{item.reason}</div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewMutation.mutate({ transferId: item.id, action: 'approved' })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'linear-gradient(135deg, #4CAF50, #66BB6A)', color: '#fff' }}
                    >
                      批准
                    </button>
                    <button
                      onClick={() => reviewMutation.mutate({ transferId: item.id, action: 'rejected' })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(244,67,54,0.15)', color: '#F44336', border: '1px solid rgba(244,67,54,0.3)' }}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 切换成员弹窗 */}
      {showUserPicker && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={() => setShowUserPicker(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-md rounded-t-2xl flex flex-col"
            style={{ background: 'linear-gradient(160deg, #0D0D00 0%, #1A1600 100%)', border: '1px solid #C9A84C', maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: '#F0D060' }}>选择成员</span>
                <button onClick={() => setShowUserPicker(false)} className="text-xl" style={{ color: '#C9A84C' }}>×</button>
              </div>
              <input
                type="text"
                placeholder="搜索成员..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', color: '#F0D060', outline: 'none' }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {filteredMembers.map((m: any) => (
                <button
                  key={m.userId}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm"
                  style={{ color: '#F0D060', background: 'rgba(201,168,76,0.06)' }}
                  onClick={() => {
                    onViewUser(m.userId);
                    setShowUserPicker(false);
                  }}
                >
                  {m.nickname || m.username}
                  <span className="ml-2 text-xs" style={{ color: 'rgba(201,168,76,0.5)' }}>
                    {m.role === 'owner' ? '创始人' : m.role === 'admin' ? '管理员' : '成员'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 权重编辑弹窗 */}
      {editingShare && (
        <EditWeightModal
          share={editingShare}
          ledgerId={ledgerId}
          onClose={() => setEditingShare(null)}
          onSuccess={handleWeightSaved}
        />
      )}
    </div>
  );
}
