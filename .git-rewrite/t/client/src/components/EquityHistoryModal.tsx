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

const EVENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  grant: { label: "授予", color: "#8B4513", bg: "rgba(201,168,76,0.15)" },
  transfer_in: { label: "转入", color: "#2E7D32", bg: "rgba(46,125,50,0.1)" },
  transfer_out_approved: { label: "转出(已批准)", color: "#C62828", bg: "rgba(198,40,40,0.08)" },
  transfer_out_pending: { label: "转出(待审核)", color: "#E65100", bg: "rgba(230,81,0,0.08)" },
  transfer_out_rejected: { label: "转出(已拒绝)", color: "rgba(58,20,0,0.4)", bg: "rgba(58,20,0,0.06)" },
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
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-80 rounded-2xl px-5 py-5"
        style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.3)', boxShadow: '0 8px 40px rgba(58,20,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold" style={{ color: '#1A0A00' }}>修改订单权重</span>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'rgba(58,20,0,0.5)' }}>×</button>
        </div>
        <div className="text-xs mb-3" style={{ color: 'rgba(58,20,0,0.5)' }}>
          仅修改此笔订单权重，不影响其他订单
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'rgba(58,20,0,0.6)' }}>资源权重</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={rw}
              onChange={e => setRw(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(58,20,0,0.04)', border: '1px solid rgba(58,20,0,0.2)', color: '#1A0A00', outline: 'none' }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'rgba(58,20,0,0.6)' }}>资金权重</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={cw}
              onChange={e => setCw(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(58,20,0,0.04)', border: '1px solid rgba(58,20,0,0.2)', color: '#1A0A00', outline: 'none' }}
            />
          </div>
          <div className="text-xs text-center" style={{ color: 'rgba(58,20,0,0.45)' }}>
            合计权重：{isNaN(totalW) ? '-' : totalW.toFixed(4)}
          </div>
        </div>
        {err && <div className="text-xs mt-2 text-center" style={{ color: '#C62828' }}>{err}</div>}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(58,20,0,0.06)', color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(58,20,0,0.15)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8B84B)', color: '#FFF8F0' }}
          >
            {updateMutation.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EquityHistoryModal({ ledgerId, userId, nickname, isAdmin, onClose, onViewUser, membersData }: Props) {
  const [tab, setTab] = useState<'history' | 'pending' | 'weights'>('history');
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

  // 权重变更日志（所有人可见，查自己或被浏览用户）
  const weightLogsUserId = isAdmin && userId > 0 ? userId : 0;
  const { data: weightLogs, isLoading: weightLogsLoading } = trpc.equity.getWeightLogs.useQuery(
    { ledgerId, userId: weightLogsUserId },
    { enabled: tab === 'weights' && (isAdmin ? userId > 0 : true), retry: false }
  );

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
    if (isAdmin && userId > 0) {
      refetchUserHistory();
    } else {
      refetchMyHistory();
    }
    utils.equity.getMemberShares.invalidate();
    utils.equity.getGlobalShareStats.invalidate();
  };

  // 色系常量（账本暖米白风格）
  const BG = '#FFF8F0';
  const BORDER = 'rgba(58,20,0,0.18)';
  const TEXT_MAIN = '#1A0A00';
  const TEXT_DIM = 'rgba(58,20,0,0.55)';
  const TEXT_FAINT = 'rgba(58,20,0,0.38)';
  const GOLD = '#C9A84C';
  const CARD_BG = 'rgba(58,20,0,0.03)';
  const CARD_BORDER = 'rgba(58,20,0,0.1)';

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-t-2xl flex flex-col"
        style={{ background: BG, border: `1px solid ${BORDER}`, boxShadow: '0 -8px 40px rgba(58,20,0,0.2)', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部拖动条 */}
        <div className="flex justify-center pt-2 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(58,20,0,0.15)' }} />
        </div>

        {/* 头部 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold" style={{ color: TEXT_MAIN, letterSpacing: '0.04em' }}>股权流水</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: GOLD, border: `1px solid rgba(201,168,76,0.3)` }}>{nickname}</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowUserPicker(true)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: 'rgba(58,20,0,0.06)', color: TEXT_DIM, border: `1px solid ${BORDER}` }}
              >
                切换成员
              </button>
            )}
            <button onClick={onClose} className="text-xl" style={{ color: TEXT_DIM }}>×</button>
          </div>
        </div>

        {/* Tab */}
        <div className="flex px-4 pt-3 pb-3 gap-2" style={{ borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {(['history', 'weights', ...(isAdmin ? ['pending'] : [])] as const).map((t: any) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-sm px-3 py-1.5 rounded-full font-medium"
              style={tab === t
                ? { background: 'linear-gradient(135deg, #C9A84C, #E8B84B)', color: '#FFF8F0', flexShrink: 0 }
                : { background: 'rgba(58,20,0,0.05)', color: TEXT_DIM, border: `1px solid ${BORDER}`, flexShrink: 0 }}
            >
              {t === 'history' ? '流水记录' : t === 'weights' ? '权重记录' : `待审批${pendingList?.length ? ` (${pendingList.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {tab === 'history' && (
            <>
              {historyLoading && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>加载中...</div>
              )}
              {!historyLoading && (!history || history.length === 0) && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>暂无股权流水记录</div>
              )}
              {history?.map((item: any, idx: number) => {
                const evInfo = EVENT_LABELS[item.eventType] || { label: item.eventType, color: TEXT_DIM, bg: CARD_BG };
                const canEditWeight = isAdmin && item.eventType === 'grant' && item.shareId;
                return (
                  <div
                    key={idx}
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
                  >
                    {/* 第一行：类型标签 + 编辑权重 + 日期 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: evInfo.bg, color: evInfo.color }}
                      >
                        {evInfo.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {canEditWeight && (
                          <button
                            onClick={() => setEditingShare(item)}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(201,168,76,0.1)', color: GOLD, border: `1px solid rgba(201,168,76,0.3)` }}
                          >
                            编辑权重
                          </button>
                        )}
                        <span className="text-xs" style={{ color: TEXT_FAINT }}>{formatDate(item.eventDate || item.createdAt)}</span>
                      </div>
                    </div>

                    {/* 第二行：张数 + 股票类型 */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                        {item.eventType.startsWith('transfer_out') ? '-' : '+'}{Number(item.shareCount).toLocaleString()} 张
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(201,168,76,0.1)', color: GOLD, border: `1px solid rgba(201,168,76,0.2)` }}
                      >
                        {item.shareType}
                      </span>
                    </div>

                    {/* 权重信息（仅授予类型显示） */}
                    {item.eventType === 'grant' && (item.resourceWeight != null || item.capitalWeight != null) && (
                      <div className="text-xs mt-0.5" style={{ color: TEXT_FAINT }}>
                        权重：{Number(item.resourceWeight ?? 1).toFixed(2)} × {Number(item.capitalWeight ?? 1).toFixed(2)} = {(Number(item.resourceWeight ?? 1) * Number(item.capitalWeight ?? 1)).toFixed(4)}
                      </div>
                    )}

                    {/* 来源信息：资源股显示来自哪个用户的资金股，资金股显示授予人 */}
                    {item.eventType === 'grant' && (
                      <div className="flex items-center gap-1 mt-1 pt-1" style={{ borderTop: `1px solid rgba(58,20,0,0.07)` }}>
                        {item.shareType === '资源股' && item.sourceNickname ? (
                          <>
                            <span className="text-[10px]" style={{ color: TEXT_FAINT }}>来源：</span>
                            <span className="text-[10px] font-medium" style={{ color: TEXT_DIM }}>{item.sourceNickname}</span>
                            {item.sourceAmount && (
                              <span className="text-[10px]" style={{ color: TEXT_FAINT }}>（{Number(item.sourceAmount).toLocaleString()} 张资金股）</span>
                            )}
                          </>
                        ) : item.createdByNickname ? (
                          <>
                            <span className="text-[10px]" style={{ color: TEXT_FAINT }}>授予人：</span>
                            <span className="text-[10px] font-medium" style={{ color: TEXT_DIM }}>{item.createdByNickname}</span>
                          </>
                        ) : null}
                      </div>
                    )}

                    {/* 对手方（转让） */}
                    {item.counterparty && (
                      <div className="text-xs mt-1" style={{ color: TEXT_DIM }}>
                        {item.eventType === 'transfer_in' ? '来自' : '转给'}：{item.counterparty}
                      </div>
                    )}

                    {/* 备注原因 */}
                    {item.reason && (
                      <div className="text-xs mt-0.5 truncate" style={{ color: TEXT_FAINT }}>{item.reason}</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'weights' && (
            <>
              {weightLogsLoading && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>加载中...</div>
              )}
              {!weightLogsLoading && (!weightLogs || weightLogs.length === 0) && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>暂无权重变更记录</div>
              )}
              {weightLogs && weightLogs.length > 0 && (weightLogs as any[]).map((log: any, idx: number) => {
                const oldTotal = (log.oldResourceWeight * log.oldCapitalWeight).toFixed(4);
                const newTotal = (log.newResourceWeight * log.newCapitalWeight).toFixed(4);
                const isFirst = idx === 0;
                return (
                  <div
                    key={log.id}
                    className="rounded-xl px-3 py-3"
                    style={{
                      background: isFirst ? 'rgba(201,168,76,0.08)' : CARD_BG,
                      border: `1px solid ${isFirst ? 'rgba(201,168,76,0.3)' : CARD_BORDER}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px]" style={{ color: TEXT_FAINT }}>
                        {new Date(log.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {' '}{new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px]" style={{ color: TEXT_FAINT }}>by {log.operatorName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-center rounded-lg py-1.5" style={{ background: 'rgba(58,20,0,0.04)', border: `1px solid ${CARD_BORDER}` }}>
                        <div className="text-[10px] mb-0.5" style={{ color: TEXT_FAINT }}>变更前</div>
                        <div className="text-xs" style={{ color: TEXT_DIM }}>
                          {log.oldResourceWeight.toFixed(2)} × {log.oldCapitalWeight.toFixed(2)}
                        </div>
                        <div className="text-sm font-bold mt-0.5" style={{ color: TEXT_DIM }}>{oldTotal}</div>
                      </div>
                      <div style={{ color: GOLD, fontSize: 14, flexShrink: 0 }}>→</div>
                      <div className="flex-1 text-center rounded-lg py-1.5" style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.25)` }}>
                        <div className="text-[10px] mb-0.5" style={{ color: TEXT_DIM }}>变更后</div>
                        <div className="text-xs" style={{ color: '#8B4513' }}>
                          {log.newResourceWeight.toFixed(2)} × {log.newCapitalWeight.toFixed(2)}
                        </div>
                        <div className="text-sm font-bold mt-0.5" style={{ color: TEXT_MAIN }}>{newTotal}</div>
                      </div>
                    </div>
                    {log.remark && (
                      <div className="mt-1.5 text-[11px]" style={{ color: TEXT_FAINT }}>备注：{log.remark}</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'pending' && isAdmin && (
            <>
              {pendingLoading && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>加载中...</div>
              )}
              {!pendingLoading && (!pendingList || pendingList.length === 0) && (
                <div className="text-center py-8 text-sm" style={{ color: TEXT_FAINT }}>暂无待审批的转让申请</div>
              )}
              {pendingList?.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-xl px-3 py-3"
                  style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: TEXT_MAIN }}>
                      {item.fromNickname} → {item.toNickname}
                    </span>
                    <span className="text-xs" style={{ color: TEXT_FAINT }}>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="text-xs mb-1" style={{ color: TEXT_DIM }}>
                    转让 {Number(item.fromShareCount).toLocaleString()} 张 {item.fromShareType}
                    {item.fromShareType !== item.toShareType && ` → ${item.toShareType}`}
                  </div>
                  {item.reason && (
                    <div className="text-xs mb-2" style={{ color: TEXT_FAINT }}>原因：{item.reason}</div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewMutation.mutate({ transferId: item.id, action: 'approved' })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)', color: '#fff' }}
                    >
                      批准
                    </button>
                    <button
                      onClick={() => reviewMutation.mutate({ transferId: item.id, action: 'rejected' })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(58,20,0,0.06)', color: TEXT_DIM, border: `1px solid ${BORDER}` }}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 成员选择器（管理员切换视角） */}
        {showUserPicker && (
          <div
            className="absolute inset-0 z-10 flex flex-col rounded-t-2xl"
            style={{ background: BG }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-sm font-semibold" style={{ color: TEXT_MAIN }}>选择成员</span>
              <button onClick={() => setShowUserPicker(false)} className="text-xl" style={{ color: TEXT_DIM }}>×</button>
            </div>
            <div className="px-4 py-2">
              <input
                type="text"
                placeholder="搜索成员..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(58,20,0,0.04)', border: `1px solid ${BORDER}`, color: TEXT_MAIN, outline: 'none' }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
              {filteredMembers.map((m: any) => (
                <button
                  key={m.userId}
                  onClick={() => { onViewUser(m.userId); setShowUserPicker(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl"
                  style={{ background: m.userId === userId ? 'rgba(201,168,76,0.1)' : 'transparent', border: `1px solid ${m.userId === userId ? 'rgba(201,168,76,0.3)' : 'transparent'}` }}
                >
                  <span className="text-sm" style={{ color: TEXT_MAIN }}>{m.nickname || m.username}</span>
                  {m.userId === userId && (
                    <span className="ml-2 text-xs" style={{ color: GOLD }}>当前</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
