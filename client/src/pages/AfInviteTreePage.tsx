import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, GitBranch } from "lucide-react";

// ===== 组织架构图树状图弹层组件 =====
type TreeUser = { id: number; name: string; invitedByUserId: number | null; payoutRatio: number };

// 单个节点卡片
function OrgCard({
  user, yjhUserId, editingId, setEditingId, inputVal, setInputVal, onSave, isSaving, localRatios,
}: {
  user: TreeUser; yjhUserId: number; editingId: number | null;
  setEditingId: (id: number | null) => void; inputVal: string;
  setInputVal: (v: string) => void; onSave: (userId: number, ratio: number) => void;
  isSaving: boolean; localRatios: Record<number, number>;
}) {
  const currentRatio = localRatios[user.id] ?? user.payoutRatio;
  const isEditing = editingId === user.id;
  const isYJH = user.id === yjhUserId;
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg px-2 py-1.5 select-none"
      style={{
        border: isYJH ? '1.5px solid #D32F2F' : '1.5px solid #BDBDBD',
        backgroundColor: isYJH ? '#FFF3F3' : '#FAFAFA',
        minWidth: 60, maxWidth: 76,
        cursor: isYJH ? 'default' : 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
      onClick={() => {
        if (!isYJH && !isEditing) {
          setEditingId(user.id);
          setInputVal(String(currentRatio.toFixed(1)));
        }
      }}
    >
      <span
        className="text-xs font-medium text-center leading-tight"
        style={{ color: isYJH ? '#D32F2F' : '#333', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
      >
        {isYJH ? 'YJH' : (user.name || '未知')}
      </span>
      {isEditing ? (
        <div className="flex items-center gap-0.5 mt-1" onClick={e => e.stopPropagation()}>
          <input
            type="number" min={0} max={100} step={0.1} value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            className="text-xs px-1 py-0.5 rounded border border-amber-300 outline-none text-center"
            style={{ width: 38, backgroundColor: '#fff', fontSize: 11 }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') onSave(user.id, parseFloat(inputVal) || 0);
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
          <button
            onClick={() => onSave(user.id, parseFloat(inputVal) || 0)}
            disabled={isSaving}
            className="text-white rounded leading-none"
            style={{ backgroundColor: '#D32F2F', fontSize: 10, padding: '2px 4px' }}
          >✓</button>
        </div>
      ) : (
        <span className="text-xs mt-0.5 font-semibold" style={{ color: isYJH ? '#D32F2F' : (currentRatio > 0 ? '#B8860B' : '#9E9E9E') }}>
          {isYJH ? 'YJH分成' : `${currentRatio.toFixed(1)}%`}
        </span>
      )}
    </div>
  );
}

// 递归渲染一层（横向排列子节点）
function OrgLevel({
  nodes, allUsers, yjhUserId, editingId, setEditingId, inputVal, setInputVal,
  onSave, isSaving, localRatios, collapsedIds, toggleCollapse,
}: {
  nodes: TreeUser[]; allUsers: TreeUser[]; yjhUserId: number;
  editingId: number | null; setEditingId: (id: number | null) => void;
  inputVal: string; setInputVal: (v: string) => void;
  onSave: (userId: number, ratio: number) => void; isSaving: boolean;
  localRatios: Record<number, number>; collapsedIds: Set<number>;
  toggleCollapse: (id: number) => void;
}) {
  return (
    <div className="flex flex-row items-start justify-center" style={{ gap: 8, flexWrap: 'wrap' }}>
      {nodes.map(node => {
        const children = allUsers.filter(u => u.invitedByUserId === node.id);
        const isCollapsed = collapsedIds.has(node.id);
        return (
          <div key={node.id} className="flex flex-col items-center">
            {/* 节点卡片 + 折叠按钮 */}
            <div className="relative" style={{ paddingBottom: children.length > 0 ? 10 : 0 }}>
              <OrgCard
                user={node} yjhUserId={yjhUserId} editingId={editingId}
                setEditingId={setEditingId} inputVal={inputVal} setInputVal={setInputVal}
                onSave={onSave} isSaving={isSaving} localRatios={localRatios}
              />
              {children.length > 0 && (
                <button
                  onClick={() => toggleCollapse(node.id)}
                  className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center text-white z-10"
                  style={{ bottom: -2, backgroundColor: '#9E9E9E', fontSize: 10, lineHeight: 1 }}
                >
                  {isCollapsed ? '+' : '−'}
                </button>
              )}
            </div>
            {/* 竖线 + 子层 */}
            {children.length > 0 && !isCollapsed && (
              <div className="flex flex-col items-center">
                <div style={{ width: 2, height: 14, backgroundColor: '#BDBDBD' }} />
                <OrgLevel
                  nodes={children} allUsers={allUsers} yjhUserId={yjhUserId}
                  editingId={editingId} setEditingId={setEditingId}
                  inputVal={inputVal} setInputVal={setInputVal}
                  onSave={onSave} isSaving={isSaving} localRatios={localRatios}
                  collapsedIds={collapsedIds} toggleCollapse={toggleCollapse}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 兼容旧调用（实际不再使用）
function TreeNode(_props: any) { return null; }
const YJH_USER_ID_CONST = 4957151;

export default function AfInviteTreePage() {
  const [, params] = useRoute("/ledger/:id/af-invite-tree");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;

  // URL 参数：viewAs
  const urlParams = new URLSearchParams(window.location.search);
  const viewAsUserId = urlParams.get('viewAs') ? Number(urlParams.get('viewAs')) : null;

  // 当前用户
  const { data: user } = trpc.auth.me.useQuery();

  // 账本基本信息（判断权限）
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery({ ledgerId }, { enabled: !!ledgerId });
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isCustomAF = (ledgerData as any)?.type === 'custom_af';

  const canSeeRecentDynamics = isCustomAF && ((user as any)?.id === YJH_USER_ID_CONST || isOwner || isAdmin);
  const isYJH = (user as any)?.id === YJH_USER_ID_CONST || (user as any)?.id === 870413;

  // 邀请树数据
  // 关键逻辑：owner/admin 且不是 YJH 本人时，自动以 YJH 视角查询（服务端只允许 YJH 用户ID返回数据）
  const ledgerLoaded = !ledgerLoading && !!ledgerData;
  const inviteTreeViewAsId = ledgerLoaded
    ? ((isOwner || isAdmin) && (user as any)?.id !== YJH_USER_ID_CONST
        ? YJH_USER_ID_CONST
        : (viewAsUserId || undefined))
    : undefined;

  const { data: inviteTreeData, isLoading: inviteTreeLoading, refetch: refetchInviteTree } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId, ...(inviteTreeViewAsId ? { viewAsUserId: inviteTreeViewAsId } : {}) },
    { enabled: ledgerLoaded && !!ledgerId }
  );

  // 最新动态数据
  const { data: recentRecharges = [] } = trpc.ledger.afGetRecentRecharges.useQuery(
    { ledgerId },
    { enabled: canSeeRecentDynamics, refetchInterval: 30000 }
  );
  const { data: recentPendingOrders = [] } = trpc.ledger.afGetRecentPendingOrders.useQuery(
    { ledgerId },
    { enabled: canSeeRecentDynamics, staleTime: 5 * 60 * 1000 }
  );
  const { data: recentCompletedOrders = [] } = trpc.ledger.afGetRecentCompletedOrders.useQuery(
    { ledgerId },
    { enabled: canSeeRecentDynamics, staleTime: 5 * 60 * 1000 }
  );
  const { data: recentGiftOrders = [] } = trpc.ledger.afGetRecentGiftOrders.useQuery(
    { ledgerId },
    { enabled: canSeeRecentDynamics, staleTime: 5 * 60 * 1000 }
  );

  // 展开状态
  const [rechargeExpanded, setRechargeExpanded] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [giftExpanded, setGiftExpanded] = useState(false);

  // 编辑状态
  const [editingNoteUserId, setEditingNoteUserId] = useState<number | null>(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});
  const [editingRatioUserId, setEditingRatioUserId] = useState<number | null>(null);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<number | null>(null);
  const [beneficiaryRatioInput, setBeneficiaryRatioInput] = useState<string>('');

  // 拨比数据
  const { data: editingMemberRatios = [], refetch: refetchMemberRatios } = trpc.ledger.afGetMemberPayoutRatios.useQuery(
    { ledgerId, sourceUserId: editingRatioUserId ?? 0 },
    { enabled: isYJH && editingRatioUserId !== null }
  );

  // Mutations
  const saveInviteNoteMutation = trpc.ledger.afSaveInviteNote.useMutation({
    onSuccess: (_data: any, variables: any) => {
      setLocalNotes(prev => ({ ...prev, [variables.targetUserId]: variables.note.trim() }));
      setEditingNoteUserId(null);
    }
  });
  const setYjhRatioMutation = trpc.ledger.afSetYjhPayoutRatio.useMutation({
    onSuccess: () => {
      refetchMemberRatios();
      setEditingBeneficiaryId(null);
      setBeneficiaryRatioInput('');
    },
    onError: (err: any) => {
      alert('保存失败：' + err.message);
    }
  });

  // ===== 简化树状图弹层状态 =====
  const [showSimpleTree, setShowSimpleTree] = useState(false);
  const [treeEditingId, setTreeEditingId] = useState<number | null>(null);
  const [treeInputVal, setTreeInputVal] = useState('');
  const [treeLocalRatios, setTreeLocalRatios] = useState<Record<number, number>>({});
  const [treeCollapsedIds, setTreeCollapsedIds] = useState<Set<number>>(new Set());
  const toggleTreeCollapse = useCallback((id: number) => {
    setTreeCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 简化树状图的波比保存（直接复用 afSetYjhPayoutRatio，beneficiaryUserId = sourceUserId = 该用户自己）
  const treeSetRatioMutation = trpc.ledger.afSetYjhPayoutRatio.useMutation({
    onSuccess: (_data: any, variables: any) => {
      setTreeLocalRatios(prev => ({ ...prev, [variables.beneficiaryUserId]: variables.newRatio }));
      setTreeEditingId(null);
      setTreeInputVal('');
      // 刷新邀请树数据
      refetchInviteTree();
    },
    onError: (err: any) => {
      alert('波比保存失败：' + err.message);
    }
  });

  const handleTreeSave = useCallback((userId: number, ratio: number) => {
    treeSetRatioMutation.mutate({
      ledgerId,
      beneficiaryUserId: userId,
      sourceUserId: userId,
      newRatio: ratio,
    });
  }, [ledgerId, treeSetRatioMutation]);

  // 构建树状图用的扁平数据（只需 id, name, invitedByUserId, payoutRatio）
  const treeUsers: TreeUser[] = (inviteTreeData?.users ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    invitedByUserId: u.invitedByUserId ?? null,
    payoutRatio: treeLocalRatios[u.id] ?? u.payoutRatio ?? 0,
  }));

  // 总波比（所有非YJH用户的波比之和）
  const totalRatio = treeUsers
    .filter(u => u.id !== YJH_USER_ID_CONST)
    .reduce((sum, u) => sum + (treeLocalRatios[u.id] ?? u.payoutRatio), 0);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#fff' }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回账本</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">邀请名单</div>
          <div className="text-xs text-gray-400">共 {inviteTreeData?.users?.length ?? 0} 人</div>
        </div>
        {/* 简化树状图按钮 */}
        {isYJH && (
          <button
            onClick={() => setShowSimpleTree(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
            style={{ backgroundColor: showSimpleTree ? '#D32F2F' : '#FFF3F3', color: showSimpleTree ? '#fff' : '#D32F2F', border: '1px solid #FFCDD2' }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>波比树</span>
          </button>
        )}
      </div>

      {/* 简化树状图弹层 */}
      {showSimpleTree && isYJH && (
        <div className="bg-white border-b border-gray-200" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #F0F0F0' }}>
            <span className="text-xs font-semibold text-gray-700">波比树状图</span>
            <span className="text-xs" style={{ color: Math.abs(totalRatio - 100) < 0.1 ? '#388E3C' : '#D32F2F' }}>
              总分成: {totalRatio.toFixed(1)}% {Math.abs(totalRatio - 100) < 0.1 ? '✓' : '⚠️应为100%'}
            </span>
          </div>
          <div className="px-3 py-2">
            <OrgLevel
              nodes={treeUsers.filter(u => u.invitedByUserId === null || u.id === YJH_USER_ID_CONST)}
              allUsers={treeUsers}
              yjhUserId={YJH_USER_ID_CONST}
              editingId={treeEditingId}
              setEditingId={setTreeEditingId}
              inputVal={treeInputVal}
              setInputVal={setTreeInputVal}
              onSave={handleTreeSave}
              isSaving={treeSetRatioMutation.isPending}
              localRatios={treeLocalRatios}
              collapsedIds={treeCollapsedIds}
              toggleCollapse={toggleTreeCollapse}
            />
          </div>
        </div>
      )}

      {/* 最新动态区 */}
      {canSeeRecentDynamics && (
        <div className="bg-white border-b border-gray-100">
          {/* 最新充值 */}
          <div style={{ backgroundColor: '#FFFBF0' }}>
            <div
              className="flex items-center px-3 py-2 cursor-pointer select-none"
              style={{ borderBottom: rechargeExpanded ? '1px solid rgba(184,134,11,0.15)' : 'none' }}
              onClick={() => setRechargeExpanded(v => !v)}
            >
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#B8860B' }}>最新充值</span>
              {!rechargeExpanded && recentRecharges.length > 0 && (
                <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                  <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{((recentRecharges[0] as any).userName || '').slice(0, 2)}</span>
                  <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#B8860B' }}>{parseFloat((recentRecharges[0] as any).amount).toFixed(0)}{(recentRecharges[0] as any).currency}</span>
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{(recentRecharges[0] as any).eventTime ? new Date((recentRecharges[0] as any).eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              )}
              {!rechargeExpanded && recentRecharges.length === 0 && (
                <span className="text-xs text-gray-300 ml-3">暂无记录</span>
              )}
              <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{rechargeExpanded ? '▲' : '▼'}</span>
            </div>
            {rechargeExpanded && (
              <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {recentRecharges.length === 0 ? (
                  <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                ) : (
                  <div className="space-y-1">
                    {(recentRecharges as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(184,134,11,0.08)' }}>
                        <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                        <span className="text-xs font-semibold" style={{ color: '#B8860B' }}>{parseFloat(r.amount).toFixed(0)}{r.currency}</span>
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 最新委托 */}
          <div style={{ backgroundColor: '#EFF6FF' }}>
            <div
              className="flex items-center px-3 py-2 cursor-pointer select-none"
              style={{ borderBottom: pendingExpanded ? '1px solid rgba(59,130,246,0.15)' : 'none' }}
              onClick={() => setPendingExpanded(v => !v)}
            >
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#1D4ED8' }}>最新委托</span>
              {!pendingExpanded && recentPendingOrders.length > 0 && (
                <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                  <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{((recentPendingOrders[0] as any).userName || '').slice(0, 2)}</span>
                  <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#1D4ED8' }}>{(recentPendingOrders[0] as any).coin} {(recentPendingOrders[0] as any).side === 'buy' ? '买' : '卖'} {(recentPendingOrders[0] as any).amount}U</span>
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{(recentPendingOrders[0] as any).eventTime ? new Date((recentPendingOrders[0] as any).eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              )}
              {!pendingExpanded && recentPendingOrders.length === 0 && (
                <span className="text-xs text-gray-300 ml-3">暂无记录</span>
              )}
              <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{pendingExpanded ? '▲' : '▼'}</span>
            </div>
            {pendingExpanded && (
              <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {recentPendingOrders.length === 0 ? (
                  <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                ) : (
                  <div className="space-y-1">
                    {(recentPendingOrders as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                        <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                        <span className="text-xs font-semibold" style={{ color: '#1D4ED8' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}U</span>
                        {r.limitPrice && <span className="text-xs text-gray-400">@{r.limitPrice}</span>}
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 最新成交 */}
          <div style={{ backgroundColor: '#F0FFF4' }}>
            <div
              className="flex items-center px-3 py-2 cursor-pointer select-none"
              style={{ borderBottom: completedExpanded ? '1px solid rgba(22,163,74,0.15)' : 'none' }}
              onClick={() => setCompletedExpanded(v => !v)}
            >
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#15803D' }}>最新成交</span>
              {!completedExpanded && recentCompletedOrders.length > 0 && (
                <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                  <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{((recentCompletedOrders[0] as any).userName || '').slice(0, 2)}</span>
                  <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#15803D' }}>{(recentCompletedOrders[0] as any).coin} {(recentCompletedOrders[0] as any).side === 'buy' ? '买' : '卖'} {(recentCompletedOrders[0] as any).amount}U</span>
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{(recentCompletedOrders[0] as any).eventTime ? new Date((recentCompletedOrders[0] as any).eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              )}
              {!completedExpanded && recentCompletedOrders.length === 0 && (
                <span className="text-xs text-gray-300 ml-3">暂无记录</span>
              )}
              <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{completedExpanded ? '▲' : '▼'}</span>
            </div>
            {completedExpanded && (
              <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {recentCompletedOrders.length === 0 ? (
                  <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                ) : (
                  <div className="space-y-1">
                    {(recentCompletedOrders as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(22,163,74,0.08)' }}>
                        <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                        <span className="text-xs font-semibold" style={{ color: '#15803D' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}U</span>
                        {r.limitPrice && <span className="text-xs text-gray-400">@{r.limitPrice}</span>}
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 行情预测 — 点击跳转到汇总页面 */}
          <div
            style={{ backgroundColor: '#F0F4FF', cursor: 'pointer' }}
            onClick={() => setLocation(`/ledger/${ledgerId}/af-prediction-stats`)}
          >
            <div className="flex items-center px-3 py-2 select-none">
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#4F46E5' }}>行情预测</span>
              <span className="text-xs text-gray-400 ml-2 flex-1">点击查看所有人竞猜订单汇总</span>
              <span className="text-xs text-gray-400 ml-auto">&#8250;</span>
            </div>
          </div>
          {/* 最新赠单 */}
          <div style={{ backgroundColor: '#FFF1F2' }}>
            <div
              className="flex items-center px-3 py-2 cursor-pointer select-none"
              style={{ borderBottom: giftExpanded ? '1px solid rgba(220,38,38,0.15)' : 'none' }}
              onClick={() => setGiftExpanded(v => !v)}
            >
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#B91C1C' }}>最新赠单</span>
              {!giftExpanded && recentGiftOrders.length > 0 && (
                <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                  <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{((recentGiftOrders[0] as any).userName || '').slice(0, 2)}</span>
                  <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#B91C1C' }}>{(recentGiftOrders[0] as any).coin} {(recentGiftOrders[0] as any).amount}U</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">←{((recentGiftOrders[0] as any).fromName || '').slice(0, 2)}</span>
                </div>
              )}
              {!giftExpanded && recentGiftOrders.length === 0 && (
                <span className="text-xs text-gray-300 ml-3">暂无记录</span>
              )}
              <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{giftExpanded ? '▲' : '▼'}</span>
            </div>
            {giftExpanded && (
              <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {recentGiftOrders.length === 0 ? (
                  <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                ) : (
                  <div className="space-y-1">
                    {(recentGiftOrders as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(220,38,38,0.08)' }}>
                        <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '5em' }}>{r.userName}({r.username})</span>
                        <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>{r.coin} {r.amount}U</span>
                        <span className="text-xs text-gray-400 truncate">←{r.fromName}({r.fromUsername})</span>
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 用户列表 */}
      <div className="flex-1 px-4 py-3">
        {inviteTreeLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
        ) : !inviteTreeData?.users?.length ? (
          <div className="text-center py-10 text-gray-400 text-sm">暂无邀请记录</div>
        ) : (
          <div className="space-y-2">
            {[...(inviteTreeData.users as any[])].sort((a: any, b: any) => {
              const assetA = Number(a.totalRecharge ?? 0) + Number(a.balance ?? 0);
              const assetB = Number(b.totalRecharge ?? 0) + Number(b.balance ?? 0);
              return assetB - assetA;
            }).map((u: any) => (
              <div key={u.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: '#F9F9F9', border: '1px solid #EEEEEE' }}>
                {/* 上层：头像 + 基本信息 */}
                <div className="flex items-start gap-3 pt-3 pb-2.5 px-3">
                  {/* 头像 */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: u.layer === 1 ? '#D32F2F' : u.layer === 2 ? '#E57373' : '#EF9A9A' }}>
                      {u.name.charAt(0)}
                    </div>
                  </div>
                  {/* 右侧信息 */}
                  <div className="flex-1 min-w-0">
                    {/* 第一行：昵称 + 用户名 + 层级标签 + 拨比标签 + 备注按钮 */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                        {u.username && (
                          <span className="text-xs text-gray-400 font-normal truncate">({u.username})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: u.layer === 1 ? '#FFEBEE' : '#FFF3E0', color: u.layer === 1 ? '#D32F2F' : '#E65100' }}>第{u.layer}层</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer"
                          style={{ backgroundColor: u.payoutRatio > 0 ? '#FFF8E1' : '#F5F5F5', color: u.payoutRatio > 0 ? '#B8860B' : '#9E9E9E' }}
                          onClick={() => {
                            if (!isYJH) return;
                            if (editingRatioUserId === u.id) {
                              setEditingRatioUserId(null);
                              setEditingBeneficiaryId(null);
                              setBeneficiaryRatioInput('');
                            } else {
                              setEditingRatioUserId(u.id);
                              setEditingBeneficiaryId(null);
                              setBeneficiaryRatioInput('');
                            }
                          }}
                        >
                          {u.payoutRatio > 0 ? `拨${u.payoutRatio}%` : '拨0%'}
                          {isYJH && <svg style={{ display: 'inline-block', marginLeft: 3, verticalAlign: 'middle' }} width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="4" x2="14" y2="4"/><circle cx="5" cy="4" r="1.5" fill="currentColor" stroke="none"/><line x1="2" y1="9" x2="14" y2="9"/><circle cx="11" cy="9" r="1.5" fill="currentColor" stroke="none"/><line x1="2" y1="14" x2="14" y2="14"/><circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>}
                        </span>
                        <button onClick={() => { setEditingNoteUserId(u.id); setNoteInputValue(localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '')); }} className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400" style={{ backgroundColor: '#EEEEEE', fontSize: 12 }} title="添加备注">注</button>
                      </div>
                    </div>
                    {/* 第二行：左侧时间+推荐人，右侧钱包状态 */}
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs text-gray-400 flex-shrink-0">{u.registeredAt || ''}</span>
                        {u.inviterName
                          ? <span className="text-xs text-gray-400 truncate">推荐人：<span className="text-gray-600">{u.inviterName}</span></span>
                          : <span className="text-xs text-gray-300 flex-shrink-0">无推荐人</span>
                        }
                      </div>
                      <div className="flex-shrink-0">
                        {u.hasWallet
                          ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>钱包已绑</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>未绑钱包</span>
                        }
                      </div>
                    </div>
                    {/* 第三行：备注（有才显示） */}
                    {(() => {
                      const displayNote = localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '');
                      return displayNote ? (
                        <div className="mt-1">
                          <span className="text-xs text-amber-700 truncate block">{displayNote}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* 中层：资产数据行 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #F0F0F0' }}>
                  {(() => {
                    const totalRecharge = Number(u.totalRecharge ?? 0);
                    const balance = Number(u.balance ?? 0);
                    const profit = Number(u.profit ?? 0);
                    const profitPct = totalRecharge > 0 ? (profit / totalRecharge) * 100 : 0;
                    const profitColor = profit > 0 ? '#B91C1C' : profit < 0 ? '#15803D' : '#9E9E9E';
                    return (
                      <>
                        <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                          <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>充值</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: totalRecharge > 0 ? '#1A2340' : '#9E9E9E' }}>{totalRecharge.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                          <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>余额</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: balance > 0 ? '#2E7D32' : '#9E9E9E' }}>{balance.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                          <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>利润</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: profitColor }}>{profit > 0 ? '+' : ''}{profit.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>获利%</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: profitColor }}>{profitPct > 0 ? '+' : ''}{profitPct.toFixed(1)}<span style={{ fontSize: 9, fontWeight: 400 }}>%</span></div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* 下层：持仓情况表格 */}
                <div className="px-3 pt-2 pb-2">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F5F5F5' }}>
                        <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'left', color: '#9E9E9E', fontWeight: 400, width: 50 }}>持仓</th>
                        <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>BTC</th>
                        <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>ETH</th>
                        <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>SOL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>持仓</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.holdingBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number(u.holdingBTC ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.holdingETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number(u.holdingETH ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.holdingSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number(u.holdingSOL ?? 0).toFixed(4)}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>挂单买</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingBuyBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number(u.pendingBuyBTC ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingBuyETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number(u.pendingBuyETH ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingBuySOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number(u.pendingBuySOL ?? 0).toFixed(4)}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>挂单卖</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingSellBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number(u.pendingSellBTC ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingSellETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number(u.pendingSellETH ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.pendingSellSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number(u.pendingSellSOL ?? 0).toFixed(4)}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>已成交</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.soldBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number(u.soldBTC ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.soldETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number(u.soldETH ?? 0).toFixed(4)}</td>
                        <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: u.soldSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number(u.soldSOL ?? 0).toFixed(4)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* YJH专属：拨比编辑面板 */}
                {isYJH && editingRatioUserId === u.id && (
                  <div className="px-3 pb-3 pt-2" style={{ backgroundColor: '#FFFBF0', borderTop: '1px solid #F5E6C8' }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: '#B8860B' }}>拨比配置（来源：{u.name}）</div>
                    {editingMemberRatios.length === 0 ? (
                      <div className="text-xs text-gray-400">加载中...</div>
                    ) : (
                      <>
                        <div className="space-y-0 mb-2" style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #F5E6C8' }}>
                          {(editingMemberRatios as any[]).map((r: any, idx: number) => (
                            <div key={r.beneficiaryUserId}
                              className="flex items-center justify-between gap-2"
                              style={{ padding: '10px 10px', backgroundColor: idx % 2 === 0 ? '#FFFDF5' : '#FFF8E8', borderBottom: idx < editingMemberRatios.length - 1 ? '1px solid #F5E6C8' : 'none', minHeight: 44 }}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-700 font-medium">{r.name}</span>
                                {r.username ? <span className="text-xs text-gray-400 ml-1">({r.username})</span> : null}
                              </div>
                              {editingBeneficiaryId === r.beneficiaryUserId ? (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    value={beneficiaryRatioInput}
                                    onChange={e => setBeneficiaryRatioInput(e.target.value)}
                                    className="text-sm px-2 py-1 rounded border border-amber-300 outline-none text-center"
                                    style={{ backgroundColor: '#fff', width: 72 }}
                                    autoFocus
                                  />
                                  <span className="text-sm text-gray-500">%</span>
                                  <button
                                    onClick={() => setYjhRatioMutation.mutate({
                                      ledgerId,
                                      sourceUserId: u.id,
                                      beneficiaryUserId: r.beneficiaryUserId,
                                      newRatio: parseFloat(beneficiaryRatioInput) || 0,
                                    })}
                                    disabled={setYjhRatioMutation.isPending}
                                    className="text-sm px-3 py-1 rounded text-white font-medium"
                                    style={{ backgroundColor: '#D32F2F' }}
                                  >保存</button>
                                  <button
                                    onClick={() => { setEditingBeneficiaryId(null); setBeneficiaryRatioInput(''); }}
                                    className="text-sm px-2 py-1 rounded text-gray-500"
                                    style={{ backgroundColor: '#EEEEEE' }}
                                  >取消</button>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                                  onClick={() => { setEditingBeneficiaryId(r.beneficiaryUserId); setBeneficiaryRatioInput(String(r.ratio)); }}
                                >
                                  <span className="text-sm font-semibold" style={{ color: r.ratio > 0 ? '#B8860B' : '#9E9E9E' }}>{r.ratio.toFixed(1)}%</span>
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#B8860B" strokeWidth="1.8" strokeLinecap="round"><path d="M11 2l3 3-9 9H2v-3L11 2z"/></svg>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                          已分配：{(editingMemberRatios as any[]).reduce((s: number, r: any) => s + r.ratio, 0).toFixed(1)}%　剩余：{(100 - (editingMemberRatios as any[]).reduce((s: number, r: any) => s + r.ratio, 0)).toFixed(1)}%
                        </div>
                        <div className="mt-2">
                          <button
                            onClick={() => { setEditingRatioUserId(null); setEditingBeneficiaryId(null); setBeneficiaryRatioInput(''); }}
                            className="text-xs px-3 py-1 rounded text-gray-500"
                            style={{ backgroundColor: '#EEEEEE' }}
                          >关闭</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 备注编辑区 */}
                {editingNoteUserId === u.id && (
                  <div className="px-3 pb-3 flex gap-2">
                    <input
                      autoFocus
                      value={noteInputValue}
                      onChange={e => setNoteInputValue(e.target.value)}
                      placeholder="输入备注（最多100字）"
                      maxLength={100}
                      className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none"
                      style={{ backgroundColor: '#fff' }}
                    />
                    <button
                      onClick={() => saveInviteNoteMutation.mutate({ ledgerId, targetUserId: u.id, note: noteInputValue })}
                      disabled={saveInviteNoteMutation.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                      style={{ backgroundColor: '#D32F2F' }}
                    >保存</button>
                    <button
                      onClick={() => setEditingNoteUserId(null)}
                      className="text-xs px-2 py-1.5 rounded-lg text-gray-500"
                      style={{ backgroundColor: '#EEEEEE' }}
                    >取消</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
