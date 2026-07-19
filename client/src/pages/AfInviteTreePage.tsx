import { useState, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, GitBranch, ArrowUpDown, Settings, BarChart2, List, ChevronDown, ChevronUp } from "lucide-react";

// 北京时间辅助函数（MySQL存储的是北京时间，服务端String()后UTC值即为北京时间值）
const getBJDateOnly_Tree = (d: any): Date => {
  if (!d) return new Date(0);
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};
const getTodayBJDateOnly_Tree = (): Date => {
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return new Date(Date.UTC(bjNow.getFullYear(), bjNow.getMonth(), bjNow.getDate()));
};
// 格式化北京时间（直接用UTC方法）
const fmtBJTime_Tree = (d: any, withTime = true): string => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  if (!withTime) return `${mo}/${da}`;
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mi}`;
};

// ===== 家族树状图弹层组件（紧凑家谱样式）=====
type TreeUser = { id: number; name: string; invitedByUserId: number | null; payoutRatio: number };

function FamilyCard({
  user, yjhUserId, localRatios, ledgerId, onNavigate,
}: {
  user: TreeUser; yjhUserId: number;
  localRatios: Record<number, number>; ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  const currentRatio = localRatios[user.id] ?? user.payoutRatio;
  const isYJH = user.id === yjhUserId;
  return (
    <div
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: isYJH ? '1.5px solid #C62828' : '1px solid #BDBDBD',
        backgroundColor: isYJH ? '#FFEBEE' : '#FAFAFA',
        borderRadius: 5, padding: '3px 6px', minWidth: 44, maxWidth: 60,
        cursor: 'pointer',
        boxShadow: isYJH ? '0 1px 4px rgba(198,40,40,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
        userSelect: 'none',
      }}
      onClick={() => onNavigate(`/ledger/${ledgerId}/af-ratio/${user.id}`)}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: isYJH ? '#C62828' : '#333', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '14px' }}>
        {isYJH ? 'YJH' : (user.name || '未知')}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, lineHeight: '13px', color: isYJH ? '#C62828' : (currentRatio > 0 ? '#E65100' : '#9E9E9E') }}>
        {`${currentRatio.toFixed(1)}%`}
      </span>
    </div>
  );
}

function FamilyNode({
  node, allUsers, yjhUserId, localRatios, collapsedIds, toggleCollapse, ledgerId, onNavigate,
}: {
  node: TreeUser; allUsers: TreeUser[]; yjhUserId: number;
  localRatios: Record<number, number>; collapsedIds: Set<number>;
  toggleCollapse: (id: number) => void; ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  const children = allUsers.filter(u => u.invitedByUserId === node.id);
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = children.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', paddingBottom: hasChildren ? 8 : 0 }}>
        <FamilyCard user={node} yjhUserId={yjhUserId} localRatios={localRatios} ledgerId={ledgerId} onNavigate={onNavigate} />
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); toggleCollapse(node.id); }}
            style={{
              position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
              width: 14, height: 14, borderRadius: '50%',
              backgroundColor: isCollapsed ? '#C62828' : '#9E9E9E',
              color: '#fff', border: '1.5px solid #fff', fontSize: 10, cursor: 'pointer', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0,
            }}
          >{isCollapsed ? '+' : '−'}</button>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 1, height: 12, backgroundColor: '#BDBDBD' }} />
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', position: 'relative', gap: 0 }}>
            {children.map((child, idx) => (
              <div key={child.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: idx > 0 ? 8 : 0, paddingRight: idx < children.length - 1 ? 8 : 0 }}>
                <div style={{ width: 1, height: 12, backgroundColor: '#BDBDBD' }} />
                <FamilyNode node={child} allUsers={allUsers} yjhUserId={yjhUserId} localRatios={localRatios} collapsedIds={collapsedIds} toggleCollapse={toggleCollapse} ledgerId={ledgerId} onNavigate={onNavigate} />
              </div>
            ))}
            {children.length > 1 && (
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', height: 1, backgroundColor: '#BDBDBD', width: `calc(100% - 16px)`, zIndex: 1 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrgLevel({ nodes, allUsers, yjhUserId, localRatios, collapsedIds, toggleCollapse, ledgerId, onNavigate }: {
  nodes: TreeUser[]; allUsers: TreeUser[]; yjhUserId: number;
  localRatios: Record<number, number>; collapsedIds: Set<number>;
  toggleCollapse: (id: number) => void; ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
      {nodes.map(node => (
        <FamilyNode key={node.id} node={node} allUsers={allUsers} yjhUserId={yjhUserId} localRatios={localRatios} collapsedIds={collapsedIds} toggleCollapse={toggleCollapse} ledgerId={ledgerId} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function TreeNode(_props: any) { return null; }
const YJH_USER_ID_CONST = 4957151;

// ===== 状态标签 =====
function StatusBadge({ status, sellStatus }: { status: string; sellStatus?: string | null; sellPrice?: number | null }) {
  if (status === 'pending') return <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: '#FEF9C3', color: '#854D0E' }}>委买中</span>;
  if (status === 'completed') {
    if (sellStatus === 'sold') return <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: '#DCFCE7', color: '#166534' }}>已卖出</span>;
    if (sellStatus === 'selling') return <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: '#FDE8D8', color: '#9A3412' }}>委卖中</span>;
    return <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: '#DBEAFE', color: '#1E40AF' }}>持仓中</span>;
  }
  return <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: '#F3F4F6', color: '#6B7280' }}>{status}</span>;
}

export default function AfInviteTreePage() {
  const [, params] = useRoute("/ledger/:id/af-invite-tree");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;

  const urlParams = new URLSearchParams(window.location.search);
  const viewAsUserId = urlParams.get('viewAs') ? Number(urlParams.get('viewAs')) : null;

  const { data: user } = trpc.auth.me.useQuery();
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery({ ledgerId }, { enabled: !!ledgerId });
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isCustomAF = (ledgerData as any)?.type === 'custom_af';

  const canSeeRecentDynamics = isCustomAF && ((user as any)?.id === YJH_USER_ID_CONST || isOwner || isAdmin);
  const isYJH = (user as any)?.id === YJH_USER_ID_CONST || (user as any)?.id === 870413;
  const isYJHOnly = (user as any)?.id === YJH_USER_ID_CONST;
  const JIANG_USER_ID = 870413;
  const canSetMarketPerm = (user as any)?.id === YJH_USER_ID_CONST || (user as any)?.id === JIANG_USER_ID;

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
  const { data: recentRecharges = [] } = trpc.ledger.afGetRecentRecharges.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics, refetchInterval: 30000 });
  const { data: recentPendingOrders = [] } = trpc.ledger.afGetRecentPendingOrders.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics, refetchInterval: 30000 });
  const { data: recentCompletedOrders = [] } = trpc.ledger.afGetRecentCompletedOrders.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics, refetchInterval: 30000 });
  const { data: recentGiftOrders = [] } = trpc.ledger.afGetRecentGiftOrders.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics, refetchInterval: 30000 });

  // 统计数据
  const { data: treeStats } = trpc.ledger.afGetTreeOrderStats.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics });

  // 试驾单权限数据（所有有权限看该页面的人都能加载）
  const { data: marketPermissions = [], refetch: refetchPermissions } = trpc.ledger.afGetMarketOrderPermissions.useQuery({ ledgerId }, { enabled: canSeeRecentDynamics });
  const setPermissionMutation = trpc.ledger.afSetMarketOrderPermission.useMutation({
    onSuccess: () => refetchPermissions(),
    onError: (e: any) => alert('设置失败：' + e.message),
  });

  // 管理费数据（应付 + 缺口）
  const { data: afFeeOrders } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: ledgerLoaded && !!ledgerId }
  );
  const afFeeByUser = useMemo(() => {
    const orders: any[] = Array.isArray(afFeeOrders) ? afFeeOrders : [];
    const map: Record<number, { pending: number; balance: number }> = {};
    const now = new Date();
    for (const o of orders) {
      const uid = Number(o.userId ?? 0);
      if (!uid) continue;
      // 只处理进行中订单（已成交且未卖出）
      if (o.status !== 'completed' || o.sellStatus) continue;
      // 管理费公式：amount×5.25/0.75×0.12/365×持有天数（赠予订单直接用 amount）
      const amount = parseFloat(o.amount || '0');
      if (amount <= 0) continue;
      const tradeValue = o.isGift ? amount : amount * 5.25;
      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
      const confirmedDay = getBJDateOnly_Tree(o.confirmedAt || o.createdAt);
      const todayDay = getTodayBJDateOnly_Tree();
      const holdDays = Math.max(1, Math.floor((todayDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const fee = dailyFee * holdDays - (o.prepaidFee ?? 0);
      if (!map[uid]) map[uid] = { pending: 0, balance: Number(o.userBalance ?? 0) };
      map[uid].pending += Math.max(0, fee);
      map[uid].balance = Number(o.userBalance ?? map[uid].balance);
    }
    return map;
  }, [afFeeOrders]);

  // 订单详情数据
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState<'all' | 'holding' | 'pending_buy' | 'pending_sell' | 'sold'>('all');
  const [orderPage, setOrderPage] = useState(1);
  const { data: treeOrdersData, isLoading: ordersLoading } = trpc.ledger.afGetTreeOrders.useQuery(
    { ledgerId, search: orderSearch, status: orderStatus, page: orderPage },
    { enabled: ledgerLoaded && !!ledgerId }
  );
  const treeOrders = (treeOrdersData as any)?.orders ?? [];
  const treeOrdersTotal = (treeOrdersData as any)?.total ?? 0;
  // 赠单折叠展开状态：key = 正单ID
  const [expandedTreeGiftOrders, setExpandedTreeGiftOrders] = useState<Record<number, boolean>>({});
  const toggleTreeGiftOrders = (orderId: number) => setExpandedTreeGiftOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));

  // 编辑状态
  const [editingNoteUserId, setEditingNoteUserId] = useState<number | null>(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});
  const saveInviteNoteMutation = trpc.ledger.afSaveInviteNote.useMutation({
    onSuccess: (_data: any, variables: any) => {
      setLocalNotes(prev => ({ ...prev, [variables.targetUserId]: variables.note.trim() }));
      setEditingNoteUserId(null);
    }
  });

  // 排序
  const [sortOrder, setSortOrder] = useState<'asset' | 'reg_asc' | 'reg_desc'>('asset');

  // 波比树
  const [treeLocalRatios, setTreeLocalRatios] = useState<Record<number, number>>({});
  const [treeCollapsedIds, setTreeCollapsedIds] = useState<Set<number>>(new Set());
  const toggleTreeCollapse = useCallback((id: number) => {
    setTreeCollapsedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const treeSetRatioMutation = trpc.ledger.afSetYjhPayoutRatio.useMutation({
    onSuccess: (_data: any, variables: any) => {
      setTreeLocalRatios(prev => ({ ...prev, [variables.beneficiaryUserId]: variables.newRatio }));
      refetchInviteTree();
    },
    onError: (err: any) => alert('波比保存失败：' + err.message),
  });
  const treeUsers: TreeUser[] = (inviteTreeData?.users ?? []).map((u: any) => ({
    id: u.id, name: u.name, invitedByUserId: u.invitedByUserId ?? null,
    payoutRatio: treeLocalRatios[u.id] ?? u.payoutRatio ?? 0,
  }));

  // 功能区折叠状态
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // 列表区 Tab
  const [listTab, setListTab] = useState<'recharge' | 'pending' | 'completed' | 'gift' | 'orders'>('recharge');

  // 订单详情子视图
  const [orderView, setOrderView] = useState<'person' | 'order'>('person');

  // 试驾单权限搜索
  const [permSearch, setPermSearch] = useState('');

  // 市价键抽屉
  const [showMarketDrawer, setShowMarketDrawer] = useState(false);

  const stats = treeStats as any;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>

      {/* ===== ① 统计功能区（蓝色顶部）===== */}
      {canSeeRecentDynamics && (
        <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' }}>
          {/* 导航栏 */}
          <div className="flex items-center px-4 pt-4 pb-2">
            <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="w-8 h-8 flex items-center justify-center rounded-full mr-3" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1">
              <span className="text-white font-semibold text-base">邀请名单</span>
            </div>
            {isYJH && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/af-wave-tree`)}
                  className="px-2.5 py-1 rounded text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }}
                >
                  波比树
                </button>
                <button
                  onClick={() => setShowMarketDrawer(true)}
                  className="px-2.5 py-1 rounded text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }}
                >
                  市价键
                </button>
              </div>
            )}
          </div>

          {/* 统计汇总表格 */}
          <div
            className="mx-4 mb-3 rounded overflow-hidden cursor-pointer"
            style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.95)' }}
            onClick={() => setStatsExpanded(v => !v)}
          >
            <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'rgba(30,58,138,0.08)', borderBottom: '1px solid rgba(30,58,138,0.1)' }}>
              <div className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5" style={{ color: '#1e3a8a' }} />
                <span className="text-xs font-semibold" style={{ color: '#1e3a8a' }}>谷底增筹统计</span>
              </div>
              {statsExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </div>
            {statsExpanded && (
              <>
                {/* 数据行（单位内嵌，无需独立表头） */}
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #e5e7eb' }}>
                  <div className="py-2.5 px-2 text-center tabular-nums font-bold" style={{ fontSize: 16, color: '#1e3a8a', borderRight: '1px solid #e5e7eb' }}>
                    {inviteTreeLoading ? '—' : (inviteTreeData?.users?.length ?? 0)}
                    {!inviteTreeLoading && <span style={{ fontSize: 11, fontWeight: 400, color: '#6B7280', marginLeft: 2 }}>人</span>}
                  </div>
                  <div className="py-2.5 px-2 text-center tabular-nums font-bold" style={{ fontSize: 16, color: '#1e3a8a', borderRight: '1px solid #e5e7eb' }}>
                    {stats?.normalCount ?? '—'}
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#6B7280', marginLeft: 2 }}>主单</span>
                  </div>
                  <div className="py-2.5 px-2 text-center tabular-nums font-bold" style={{ fontSize: 16, color: '#1e3a8a' }}>
                    {stats?.giftCount ?? '—'}
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#ef4444', marginLeft: 2 }}>赠单</span>
                  </div>
                </div>
                {/* 币种分布行：主单 + 赠单各自独立显示，风格与上方表格一致 */}
                {stats && (stats.normalByCoins || stats.giftByCoins) && (() => {
                  // 每个币种独立一块：币种名 + 持仓总量 + 主单数/赠单数
                  const DECIMALS: Record<string, number> = { BTC: 4, ETH: 2, SOL: 1 };
                  const coins = [
                    { name: 'BTC', normal: stats.normalByCoins?.btc ?? 0, gift: stats.giftByCoins?.btc ?? 0 },
                    { name: 'ETH', normal: stats.normalByCoins?.eth ?? 0, gift: stats.giftByCoins?.eth ?? 0 },
                    { name: 'SOL', normal: stats.normalByCoins?.sol ?? 0, gift: stats.giftByCoins?.sol ?? 0 },
                  ].filter(c => c.normal > 0 || c.gift > 0);
                  if (coins.length === 0) return null;
                  return (
                    <div style={{ borderTop: '1px solid #e5e7eb' }}>
                      {/* 币种数据行（单位已内嵌在数字后，无需独立表头） */}
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${coins.length}, 1fr)` }}>
                        {coins.map((c, i) => {
                          const total = c.normal + c.gift;
                          const dec = DECIMALS[c.name] ?? 2;
                          const fmtNormal = c.normal.toFixed(dec);
                          const fmtGift = c.gift.toFixed(dec);
                          return (
                            <div key={c.name} style={{ textAlign: 'center', padding: '6px 4px', borderRight: i < coins.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                              {/* 持仓总量大字 + 币种单位 */}
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                                {total.toFixed(dec)}
                                <span style={{ fontSize: 9, fontWeight: 400, color: '#6B7280', marginLeft: 1 }}>{c.name}</span>
                              </div>
                              {/* 主单持仓 + 赠单持仓小字 */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 3 }}>
                                <span style={{ fontSize: 9, color: '#9CA3AF' }}>主<span style={{ color: '#374151', fontWeight: 600 }}>{fmtNormal}</span></span>
                                <span style={{ fontSize: 9, color: '#D1D5DB' }}>·</span>
                                <span style={{ fontSize: 9, color: '#ef4444' }}>赠<span style={{ color: '#374151', fontWeight: 600 }}>{fmtGift}</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* 非 canSeeRecentDynamics 时的普通导航栏 */}
      {!canSeeRecentDynamics && (
        <div className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#fff' }}>
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="flex items-center gap-1.5 text-gray-600 mr-3">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">返回账本</span>
          </button>
          <div className="flex-1">
            <div className="text-base font-bold text-gray-900">邀请名单</div>
            <div className="text-xs text-gray-400">共 {inviteTreeData?.users?.length ?? 0} 人</div>
          </div>
        </div>
      )}



      {/* ===== ③ 列表区（五 Tab）===== */}
      {canSeeRecentDynamics && (
        <div className="mx-3 mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #E0E0E0', backgroundColor: '#fff' }}>
          {/* Tab 栏 */}
          <div className="flex border-b border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {([
              { key: 'recharge', label: '最新充值', color: '#B8860B', bg: '#FFFBF0' },
              { key: 'pending', label: '最新委托', color: '#1D4ED8', bg: '#EFF6FF' },
              { key: 'completed', label: '最新成交', color: '#15803D', bg: '#F0FFF4' },
              { key: 'gift', label: '最新赠单', color: '#B91C1C', bg: '#FFF1F2' },
              { key: 'orders', label: '订单详情', color: '#6B21A8', bg: '#FAF5FF' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setListTab(t.key)}
                className="flex-shrink-0 px-3 py-2 text-xs font-medium transition-all"
                style={listTab === t.key
                  ? { color: t.color, borderBottom: `2px solid ${t.color}`, backgroundColor: t.bg }
                  : { color: '#9CA3AF', borderBottom: '2px solid transparent' }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div style={{ minHeight: 120 }}>

            {/* 最新充值 */}
            {listTab === 'recharge' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, margin: '6px 12px', overflow: 'hidden' }}>
                {(recentRecharges as any[]).length === 0
                  ? <div style={{ fontSize: 12, color: '#D1D5DB', padding: '16px', textAlign: 'center' }}>暂无记录</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', fontSize: 11, color: '#9CA3AF' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>日期</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>金额</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>会员</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recentRecharges as any[]).map((r: any, i: number) => {
                          const dateStr = fmtBJTime_Tree(r.eventTime, true);
                          return (
                          <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 8px', color: '#9CA3AF', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb', fontSize: 11 }}>{dateStr}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb' }}>{parseFloat(r.amount).toFixed(0)}<span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 1 }}>u</span></td>
                            <td style={{ padding: '7px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{r.userName} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{r.username}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                }
              </div>
            )}

            {/* 最新委托 */}
            {listTab === 'pending' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, margin: '6px 12px', overflow: 'hidden' }}>
                {(recentPendingOrders as any[]).length === 0
                  ? <div style={{ fontSize: 12, color: '#D1D5DB', padding: '16px', textAlign: 'center' }}>暂无记录</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', fontSize: 11, color: '#9CA3AF' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>日期</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>委托</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>会员</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recentPendingOrders as any[]).map((r: any, i: number) => {
                          const dateStr = fmtBJTime_Tree(r.eventTime, true);
                          return (
                          <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 8px', color: '#9CA3AF', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb', fontSize: 11 }}>{dateStr}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}<span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 1 }}>u</span>{r.limitPrice ? <span style={{ fontSize: 10, color: '#9CA3AF' }}> @{r.limitPrice}</span> : ''}</td>
                            <td style={{ padding: '7px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{r.userName} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{r.username}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                }
                <div style={{ fontSize: 11, color: '#9CA3AF', padding: '6px 10px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>已成交的委托单将不再显示于此，可在「最新成交」中查看</div>
              </div>
            )}

            {/* 最新成交 */}
            {listTab === 'completed' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, margin: '6px 12px', overflow: 'hidden' }}>
                {(recentCompletedOrders as any[]).length === 0
                  ? <div style={{ fontSize: 12, color: '#D1D5DB', padding: '16px', textAlign: 'center' }}>暂无记录</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', fontSize: 11, color: '#9CA3AF' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>日期</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>成交</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>会员</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recentCompletedOrders as any[]).map((r: any, i: number) => {
                          const dateStr = fmtBJTime_Tree(r.eventTime, false);
                          return (
                          <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 8px', color: '#9CA3AF', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb', fontSize: 11 }}>{dateStr}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}<span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 1 }}>u</span>{r.limitPrice ? <span style={{ fontSize: 10, color: '#9CA3AF' }}> @{r.limitPrice}</span> : ''}</td>
                            <td style={{ padding: '7px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{r.userName} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{r.username}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                }
              </div>
            )}

            {/* 最新赠单 */}
            {listTab === 'gift' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, margin: '6px 12px', overflow: 'hidden' }}>
                {(recentGiftOrders as any[]).length === 0
                  ? <div style={{ fontSize: 12, color: '#D1D5DB', padding: '16px', textAlign: 'center' }}>暂无记录</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', fontSize: 11, color: '#9CA3AF' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>日期</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>金额</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>赠单人</th>
                          <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>会员</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recentGiftOrders as any[]).map((r: any, i: number) => {
                          const dateStr = fmtBJTime_Tree(r.eventTime, true);
                          return (
                          <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 8px', color: '#9CA3AF', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb', fontSize: 11 }}>{dateStr}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb' }}>{r.coin} {r.amount}<span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 1 }}>u</span></td>
                            <td style={{ padding: '7px 8px', color: '#6B7280', whiteSpace: 'nowrap', borderRight: '1px solid #e5e7eb' }}>{r.fromName}</td>
                            <td style={{ padding: '7px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{r.userName} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{r.username}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                }
              </div>
            )}

            {/* 订单详情 */}
            {listTab === 'orders' && (
              <div>
                {/* 子视图切换 + 排序按钮 */}
                <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                  {([
                    { key: 'person', label: '人员视图' },
                    { key: 'order', label: '订单视图' },
                  ] as const).map(v => (
                    <button
                      key={v.key}
                      onClick={() => setOrderView(v.key)}
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={orderView === v.key
                        ? { backgroundColor: '#6B21A8', color: '#fff' }
                        : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {v.label}
                    </button>
                  ))}
                  {/* 排序按钮（仅人员视图显示）*/}
                  {orderView === 'person' && isYJH && (
                    <button
                      onClick={() => setSortOrder(v => v === 'asset' ? 'reg_asc' : v === 'reg_asc' ? 'reg_desc' : 'asset')}
                      className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      <span>{sortOrder === 'asset' ? '按资产' : sortOrder === 'reg_asc' ? '注册↑' : '注册↓'}</span>
                    </button>
                  )}
                </div>

                {/* 人员视图：原有邀请名单卡片 */}
                {orderView === 'person' && (
                  <div className="px-3 pb-3 pt-1">
                    {inviteTreeLoading ? (
                      <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
                    ) : !inviteTreeData?.users?.length ? (
                      <div className="text-center py-6 text-gray-400 text-sm">暂无邀请记录</div>
                    ) : (
                      <div className="space-y-2">
                        {[...(inviteTreeData.users as any[])].sort((a: any, b: any) => {
                          if (sortOrder === 'reg_asc') return (a.registeredAtTs ?? 0) - (b.registeredAtTs ?? 0);
                          if (sortOrder === 'reg_desc') return (b.registeredAtTs ?? 0) - (a.registeredAtTs ?? 0);
                          const assetA = Number(a.totalRecharge ?? 0) + Number(a.balance ?? 0);
                          const assetB = Number(b.totalRecharge ?? 0) + Number(b.balance ?? 0);
                          return assetB - assetA;
                        }).map((u: any) => (
                          <div key={u.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: '#F9F9F9', border: '1px solid #EEEEEE' }}>
                            {/* 上层：头像 + 基本信息 */}
                            <div className="flex items-start gap-3 pt-3 pb-2.5 px-3">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: u.layer === 1 ? '#D32F2F' : u.layer === 2 ? '#E57373' : '#EF9A9A' }}>
                                  {u.name.charAt(0)}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                                    <span className="text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                                    {u.username && <span className="text-xs text-gray-400 font-normal truncate">({u.username})</span>}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: u.layer === 1 ? '#FFEBEE' : '#FFF3E0', color: u.layer === 1 ? '#D32F2F' : '#E65100' }}>第{u.layer}层</span>
                                    <span
                                      className="text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer"
                                      style={{ backgroundColor: u.payoutRatio > 0 ? '#FFF8E1' : '#F5F5F5', color: u.payoutRatio > 0 ? '#B8860B' : '#9E9E9E' }}
                                      onClick={() => { if (!isYJH) return; setLocation(`/ledger/${ledgerId}/af-ratio/${u.id}`); }}
                                    >
                                      {u.payoutRatio > 0 ? `拨${u.payoutRatio}%` : '拨0%'}
                                      {isYJH && <svg style={{ display: 'inline-block', marginLeft: 2, verticalAlign: 'middle' }} width="8" height="8" viewBox="0 0 8 8"><path d="M1 7L7 1M7 1H3M7 1V5" stroke="#B8860B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </span>
                                    <button onClick={() => { setEditingNoteUserId(u.id); setNoteInputValue(localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '')); }} className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400" style={{ backgroundColor: '#EEEEEE', fontSize: 12 }} title="添加备注">注</button>
                                  </div>
                                </div>
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
                                {(() => {
                                  const displayNote = localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '');
                                  return displayNote ? <div className="mt-1"><span className="text-xs text-amber-700 truncate block">{displayNote}</span></div> : null;
                                })()}
                              </div>
                            </div>
                            {/* 中层：资产数据行 */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #F0F0F0' }}>
                              {(() => {
                                const totalRecharge = Number(u.totalRecharge ?? 0);
                                const balance = Number(u.balance ?? 0);
                                const feeData = afFeeByUser[u.id];
                                const pending = feeData ? feeData.pending : null;
                                const shortfall = (pending !== null) ? Math.max(0, pending - balance) : null;
                                const shortfallColor = shortfall !== null && shortfall > 0 ? '#B91C1C' : '#15803D';
                                return (
                                  <>
                                    <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                                      <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>充値</div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: totalRecharge > 0 ? '#1A2340' : '#9E9E9E' }}>{totalRecharge.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                                    </div>
                                    <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                                      <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>余额</div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: balance > 0 ? '#2E7D32' : '#9E9E9E' }}>{balance.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                                    </div>
                                    <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                                      <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>应付</div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: pending !== null && pending > 0 ? '#B45309' : '#9E9E9E' }}>
                                        {pending !== null ? <>{pending.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></> : '-'}
                                      </div>
                                    </div>
                                    <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>缺口</div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: shortfall !== null ? shortfallColor : '#9E9E9E' }}>
                                        {shortfall !== null ? <>{shortfall.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></> : '-'}
                                      </div>
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
                                  {[
                                    { label: '持仓', btc: u.holdingBTC, eth: u.holdingETH, sol: u.holdingSOL },
                                    { label: '挂单买', btc: u.pendingBuyBTC, eth: u.pendingBuyETH, sol: u.pendingBuySOL },
                                    { label: '挂单卖', btc: u.pendingSellBTC, eth: u.pendingSellETH, sol: u.pendingSellSOL },
                                    { label: '已成交', btc: u.soldBTC, eth: u.soldETH, sol: u.soldSOL },
                                  ].map(row => (
                                    <tr key={row.label}>
                                      <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>{row.label}</td>
                                      <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: Number(row.btc ?? 0) > 0 ? '#B45309' : '#9E9E9E' }}>{Number(row.btc ?? 0).toFixed(4)}</td>
                                      <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: Number(row.eth ?? 0) > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number(row.eth ?? 0).toFixed(4)}</td>
                                      <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: Number(row.sol ?? 0) > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number(row.sol ?? 0).toFixed(4)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* 备注编辑区 */}
                            {editingNoteUserId === u.id && (
                              <div className="px-3 pb-3 flex gap-2">
                                <input autoFocus value={noteInputValue} onChange={e => setNoteInputValue(e.target.value)} placeholder="输入备注（最多100字）" maxLength={100} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none" style={{ backgroundColor: '#fff' }} />
                                <button onClick={() => saveInviteNoteMutation.mutate({ ledgerId, targetUserId: u.id, note: noteInputValue })} disabled={saveInviteNoteMutation.isPending} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: '#D32F2F' }}>保存</button>
                                <button onClick={() => setEditingNoteUserId(null)} className="text-xs px-2 py-1.5 rounded-lg text-gray-500" style={{ backgroundColor: '#EEEEEE' }}>取消</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 订单视图：搜索+筛选+表格 */}
                {orderView === 'order' && (
                  <div className="px-3 pb-3 pt-1">
                    {/* 搜索框 */}
                    <input
                      value={orderSearch}
                      onChange={e => { setOrderSearch(e.target.value); setOrderPage(1); }}
                      placeholder="搜索用户名/币种..."
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 outline-none mb-2"
                      style={{ backgroundColor: '#F9F9F9' }}
                    />
                    {/* 状态筛选 */}
                    <div className="flex gap-2 mb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                      {([
                        { key: 'all', label: '全部' },
                        { key: 'holding', label: '持仓中' },
                        { key: 'pending_buy', label: '委托买' },
                        { key: 'pending_sell', label: '委托卖' },
                        { key: 'sold', label: '已卖出' },
                      ] as const).map(s => (
                        <button
                          key={s.key}
                          onClick={() => { setOrderStatus(s.key); setOrderPage(1); }}
                          className="flex-shrink-0"
                          style={orderStatus === s.key
                            ? { padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, backgroundColor: '#6B21A8', color: '#fff', border: '1px solid #6B21A8', lineHeight: '18px' }
                            : { padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, backgroundColor: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', lineHeight: '18px' }
                          }
                        >
                          {s.label}
                        </button>
                      ))}
                      <span className="ml-auto text-xs text-gray-400 self-center">共{treeOrdersTotal}单</span>
                    </div>
                    {/* 订单列表 */}
                    {ordersLoading ? (
                      <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
                    ) : treeOrders.length === 0 ? (
                      <div className="text-center py-6 text-gray-300 text-sm">暂无订单</div>
                    ) : (
                      <div className="space-y-2">
                        {treeOrders.map((o: any) => {
                          // 订单编号生成（用UTC方法，MySQL存的北京时间在UTC环境下UTC值=北京时间值）
                          const orderDate = new Date(o.createdAt);
                          const yy = String(orderDate.getUTCFullYear()).slice(2);
                          const mm = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
                          const dd = String(orderDate.getUTCDate()).padStart(2, '0');
                          const orderNo = `AF${yy}${mm}${dd}${String(o.id).padStart(6, '0')}`;
                          return (
                            <div key={o.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB', backgroundColor: '#FAFAFA' }}>
                              {/* 第一行：用户 + 订单号 + 状态 */}
                              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #F0F0F0' }}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-semibold text-gray-800 truncate">{o.userName}</span>
                                  <span className="text-xs text-gray-400">({o.username})</span>
                                  {o.isGift && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, backgroundColor: '#FFF1F2', color: '#B91C1C', border: '1px solid #FECDD3', flexShrink: 0 }}>赠</span>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-gray-400">{orderNo}</span>
                                  <StatusBadge status={o.status} sellStatus={o.sellStatus} />
                                </div>
                              </div>
                              {/* 第一行：币种 / 买入价 / 金额 / 实时币数 */}
                              <div className="grid px-3 pt-2 pb-1 gap-x-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>币种</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: o.coin === 'BTC' ? '#B45309' : o.coin === 'ETH' ? '#1D4ED8' : '#7C3AED' }}>
                                    {o.coin}{o.orderType === 'market' && <span style={{ fontSize: 9, marginLeft: 1, color: '#6B7280' }}>市</span>}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>买入价</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{o.limitPrice ? o.limitPrice.toFixed(0) : '市价'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>金额(U)</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1A2340' }}>{o.amount.toFixed(0)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>实时币数</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                                    {(o as any).effectiveQty != null
                                      ? (o.coin === 'BTC' ? (o as any).effectiveQty.toFixed(4) : o.coin === 'SOL' ? (o as any).effectiveQty.toFixed(1) : (o as any).effectiveQty.toFixed(2))
                                      : '—'}
                                  </div>
                                </div>
                              </div>
                              {/* 第二行：天数 / 档位 / 委托卖出价 or 下单时间 */}
                              <div className="grid px-3 pb-2 pt-1 gap-x-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #F3F4F6' }}>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>天数</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{(() => {
                                    if (!o.createdAt) return '—';
                                    const buyD = getBJDateOnly_Tree(o.createdAt);
                                    const endD = (o.status === 'completed' && o.sellConfirmedAt)
                                      ? getBJDateOnly_Tree(o.sellConfirmedAt)
                                      : getTodayBJDateOnly_Tree();
                                    const d = Math.floor((endD.getTime() - buyD.getTime()) / 86400000) + 1;
                                    return `${d > 0 ? d : 1}天`;
                                  })()}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>档位</div>
                                  <div style={{ fontSize: 11, fontWeight: 600 }}>
                                    {(() => {
                                      const RATES: Record<number, number> = { 0: 1.0, 1: 0.6667, 2: 0.4444, 3: 0.3333, 4: 0.2667, 5: 0.2222, 6: 0.1905, 7: 0.1667, 8: 0.1481, 9: 0.1333 };
                                      if (o.tierMode === 'linear') {
                                        const buyP = o.limitPrice || 0;
                                        const allLow = (o as any).allTimeLowPrice || 0;
                                        const rate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
                                        const pct = (rate * 100).toFixed(1);
                                        return <span style={{ color: '#3B82F6' }}>L {pct}%</span>;
                                      } else {
                                        const tier = (o as any).equityTier || 0;
                                        const rate = RATES[tier] ?? 1.0;
                                        const pct = (rate * 100).toFixed(1);
                                        const label = tier === 0 ? 'D0档' : `D${tier}档`;
                                        return <span style={{ color: '#0d9488' }}>{label} {pct}%</span>;
                                      }
                                    })()}
                                  </div>
                                </div>
                                {o.sellStatus === 'selling' ? (
                                  <div>
                                    <div style={{ fontSize: 9, color: '#9CA3AF' }}>委托卖出价</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>{o.sellPrice ? o.sellPrice.toFixed(0) : '—'}</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontSize: 9, color: '#9CA3AF' }}>下单时间</div>
                                    <div style={{ fontSize: 10, color: '#6B7280' }}>{o.createdAt ? fmtBJTime_Tree(o.createdAt, true) : '—'}</div>
                                  </div>
                                )}
                              </div>
                              {/* 赠单折叠区块 */}
                              {(() => {
                                const gifts: any[] = (o as any).giftOrders || [];
                                if (gifts.length === 0) return null;
                                const isExpanded = !!expandedTreeGiftOrders[o.id];
                                const totalQty = gifts.reduce((s: number, g: any) => s + (g.quantity || 0), 0);
                                return (
                                  <div className="mt-0" style={{ borderTop: '1px solid #F3F4F6' }}>
                                    <button
                                      onClick={() => toggleTreeGiftOrders(o.id)}
                                      className="w-full flex items-center justify-between px-3 py-2 text-xs"
                                      style={{ backgroundColor: '#FAF5FF', color: '#7C3AED' }}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', backgroundColor: '#DDD6FE', color: '#5B21B6', fontWeight: 700, fontSize: 10 }}>赠</span>
                                        <span style={{ fontWeight: 500 }}>已触发赠予订单</span>
                                        <span style={{ color: '#A78BFA' }}>共 {gifts.length} 笔 · {totalQty.toFixed(4)} {o.coin}</span>
                                      </div>
                                      <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▾</span>
                                    </button>
                                    {isExpanded && (
                                      <div style={{ border: '1px solid #EDE9FE', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                                        {gifts.map((g: any, idx: number) => {
                                          let gStatusLabel = '委买中'; let gStatusColor = '#D97706';
                                          if (g.sellStatus === 'sold') { gStatusLabel = '已卖出'; gStatusColor = '#2563EB'; }
                                          else if (g.sellStatus === 'selling') { gStatusLabel = '委卖中'; gStatusColor = '#DC2626'; }
                                          else if (g.status === 'completed') { gStatusLabel = '持仓中'; gStatusColor = '#16A34A'; }
                                          else if (g.status === 'cancelled') { gStatusLabel = '已撤单'; gStatusColor = '#9CA3AF'; }
                                          return (
                                            <div key={g.id} style={{ padding: '8px 12px', fontSize: 11, backgroundColor: '#fff', borderTop: idx > 0 ? '1px solid #F5F3FF' : 'none' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, color: '#374151' }}>{g.username && g.userName && g.username !== g.userName ? `${g.username}/${g.userName}` : g.userName || g.username}</span>
                                                <span style={{ fontWeight: 500, color: gStatusColor }}>{gStatusLabel}</span>
                                              </div>
                                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 8px' }}>
                                                <div><div style={{ fontSize: 9, color: '#9CA3AF' }}>金额(U)</div><div style={{ fontSize: 11, fontWeight: 600 }}>{g.amount.toFixed(0)}</div></div>
                                                <div><div style={{ fontSize: 9, color: '#9CA3AF' }}>数量</div><div style={{ fontSize: 11, fontWeight: 600 }}>{g.quantity.toFixed(4)}</div></div>
                                                <div><div style={{ fontSize: 9, color: '#9CA3AF' }}>买入价</div><div style={{ fontSize: 11, fontWeight: 600 }}>{g.limitPrice ? g.limitPrice.toFixed(0) : '市价'}</div></div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                        {/* 翻页 */}
                        {treeOrdersTotal > 20 && (
                          <div className="flex items-center justify-center gap-3 pt-2">
                            <button disabled={orderPage <= 1} onClick={() => setOrderPage(p => p - 1)} className="px-3 py-1 rounded text-xs" style={{ backgroundColor: orderPage <= 1 ? '#F3F4F6' : '#E5E7EB', color: orderPage <= 1 ? '#D1D5DB' : '#374151' }}>上一页</button>
                            <span className="text-xs text-gray-500">第{orderPage}页 / 共{Math.ceil(treeOrdersTotal / 20)}页</span>
                            <button disabled={orderPage >= Math.ceil(treeOrdersTotal / 20)} onClick={() => setOrderPage(p => p + 1)} className="px-3 py-1 rounded text-xs" style={{ backgroundColor: orderPage >= Math.ceil(treeOrdersTotal / 20) ? '#F3F4F6' : '#E5E7EB', color: orderPage >= Math.ceil(treeOrdersTotal / 20) ? '#D1D5DB' : '#374151' }}>下一页</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 底部留白 */}
      <div className="h-6" />

      {/* ===== 市价键管理抽屉 ===== */}
      {showMarketDrawer && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowMarketDrawer(false)}
        >
          <div
            className="flex flex-col rounded-t-2xl"
            style={{ backgroundColor: '#F5F5F5', maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 抽屉标题栏 */}
            <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2563EB 100%)', borderRadius: '16px 16px 0 0' }}>
              <div className="flex items-center px-4 pt-4 pb-3">
                <div className="flex-1">
                  <span className="text-white font-semibold text-base">市价键管理</span>
                </div>
                <div className="text-xs text-white opacity-70 mr-3">
                  已开启 {(marketPermissions as any[]).filter((p: any) => p.enabled).length} / {(marketPermissions as any[]).length} 人
                </div>
                <button
                  onClick={() => setShowMarketDrawer(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <span className="text-white text-lg font-bold leading-none">×</span>
                </button>
              </div>
              {/* 说明文字 */}
              <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs text-white opacity-80" style={{ background: 'rgba(255,255,255,0.12)' }}>
                开启后，该用户在下单页面可以看到并使用市价单功能；关闭则不可见。
                <br /><br />
                <span style={{ fontWeight: 600, color: '#FDE68A' }}>注意：</span>试价单单笔金额上限为 3000U，超过 3000U 请通过委托单下单。
              </div>
            </div>

            {/* 搜索框 */}
            <div className="mx-3 mt-3">
              <input
                value={permSearch}
                onChange={e => setPermSearch(e.target.value)}
                placeholder="搜索用户名..."
                className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none"
                style={{ backgroundColor: '#fff' }}
              />
            </div>

            {/* 用户列表（可滚动）*/}
            <div className="mx-3 mt-2 mb-4 space-y-2 overflow-y-auto" style={{ maxHeight: '55vh' }}>
              {(marketPermissions as any[])
                .filter((p: any) => !permSearch || (p.name || '').includes(permSearch) || (p.username || '').includes(permSearch))
                .length === 0 && (
                <div className="text-center py-10 text-gray-300 text-sm">暂无数据</div>
              )}
              {(marketPermissions as any[])
                .filter((p: any) => !permSearch || (p.name || '').includes(permSearch) || (p.username || '').includes(permSearch))
                .map((p: any) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between px-3 py-3 rounded-xl"
                    style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: p.enabled ? '#3B82F6' : '#9E9E9E' }}
                      >
                        {(p.name || '?').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{p.username}</span>
                        </div>
                        <div className="text-xs text-gray-400">{p.orderCount ?? 0} 单</div>
                      </div>
                    </div>
                    {/* 开关按钮 */}
                    <button
                      onClick={() => canSetMarketPerm && setPermissionMutation.mutate({ ledgerId, userId: p.userId, enabled: !p.enabled })}
                      disabled={!canSetMarketPerm || setPermissionMutation.isPending}
                      className="flex-shrink-0 relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none"
                      style={{
                        width: 44,
                        height: 26,
                        backgroundColor: p.enabled ? '#3B82F6' : '#D1D5DB',
                        opacity: (!canSetMarketPerm || setPermissionMutation.isPending) ? 0.6 : 1,
                        cursor: (!canSetMarketPerm || setPermissionMutation.isPending) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span
                        className="inline-block rounded-full bg-white shadow transition-transform duration-200"
                        style={{ width: 20, height: 20, transform: p.enabled ? 'translateX(20px)' : 'translateX(3px)' }}
                      />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

