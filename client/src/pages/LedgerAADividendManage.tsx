/**
 * LedgerAADividendManage.tsx
 * 定制账本(AA) 分红页
 *
 * 管理员（owner/admin）：查看所有成员分红汇总，可添加/编辑/删除
 * 普通成员：只查看自己的分红明细，可修改备注
 */
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X, PauseCircle, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { ReadonlyWalletSnapshot } from "@/components/ReadonlyWalletSnapshot";
import { useAuth } from "@/_core/hooks/useAuth";
import { AI_WALLET_CRYPTO_MARKET_ASSETS } from "@shared/ai-wallet-assets";

export default function LedgerAADividendManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();

  // 添加弹窗状态（仅管理员使用）
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    targetUserId: 0,
    tagName: "",
    amount: "",
    assetCode: "CNY",
    note: "",
  });

  // 编辑弹窗状态（管理员编辑分红）
  const [editRecord, setEditRecord] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  // 已入账分红不可直接编辑；管理员可选择撤回原记录或写入一笔等额冲正。
  const [revokeDividendRecord, setRevokeDividendRecord] = useState<any | null>(null);

  // 管理员备注功能（标签维度）
  const [showNoteModal, setShowNoteModal] = useState<{ userId: number; userName: string; tagName: string } | null>(null);
  const [newNoteContent, setNewNoteContent] = useState("");

  // 用户端：行内编辑备注
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  // 展开某个成员的明细
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  // 展开某个标签的明细（key: `${userId}__${tagName}`）
  const [expandedTagKey, setExpandedTagKey] = useState<string | null>(null);
  // 暂停成员默认折叠；混合成员的暂停标签也单独折叠，避免和进行中标签混排。
  const [showPausedMembers, setShowPausedMembers] = useState(false);
  const [expandedPausedTagsUserId, setExpandedPausedTagsUserId] = useState<number | null>(null);
  // 针对某标签快捷添加分红（行内输入）
  const [quickAdd, setQuickAdd] = useState<{ userId: number; tagName: string } | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickNote, setQuickNote] = useState("");
  // 37号分红管理：仅胡大叔可通过成员头像读取全局钱包快照。
  const [walletSnapshotUser, setWalletSnapshotUser] = useState<{ id: number; name: string; username?: string } | null>(null);

  // 获取账本信息（权限校验）
  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 管理员备注查询
  const { data: notesData, refetch: refetchNotes } = trpc.getAdminNotes.useQuery(
    { ledgerId, type: 'dividend' as const, userId: showNoteModal?.userId ?? 0, tagName: showNoteModal?.tagName ?? '' },
    { enabled: !!ledgerId && !!showNoteModal }
  );

  // 管理员添加备注（标签维度）
  // 全部成员各标签的分红备注数量（key: `${userId}|${tagName}`）
  const { data: noteCountsData, refetch: refetchNoteCounts } = trpc.getAdminNoteCounts.useQuery(
    { ledgerId, type: 'dividend' as const, allMembers: true },
    { enabled: !!ledgerId }
  );
  const noteCounts = (noteCountsData?.counts ?? {}) as Record<string, number>;

  const addNoteMutation = trpc.adminAddNote.useMutation({
    onSuccess: () => {
      toast.success("备注已添加");
      setNewNoteContent("");
      refetchNotes();
      refetchNoteCounts();
    },
    onError: (err) => { toast.error(err.message || "添加失败"); },
  });

  // 管理员删除备注
  const deleteNoteMutation = trpc.adminDeleteNote.useMutation({
    onSuccess: () => {
      toast.success("备注已删除");
      refetchNotes();
      refetchNoteCounts();
    },
    onError: (err) => { toast.error(err.message || "删除失败"); },
  });

  const isAdmin = ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin';
  // 37号账本的分红仅由胡大叔维护；其他账本保持原有 owner/admin 权限。
  const canManageDividends = ledgerId === 37 ? Number(user?.id) === 870413 : isAdmin;
  const walletSnapshotQuery = trpc.adminGetLedger37MemberWalletSnapshot.useQuery(
    { ledgerId: 37, targetUserId: walletSnapshotUser?.id || 0 },
    {
      enabled: ledgerId === 37 && canManageDividends && !!walletSnapshotUser?.id,
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  );

  // ── 管理员：获取成员列表和所有分红记录 ──
  const { data: initialBalancesAll } = trpc.ledger.adminGetAllInitialBalances.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && canManageDividends }
  );
  const members: any[] = useMemo(() => initialBalancesAll?.members ?? [], [initialBalancesAll]);

  const balancesMap: Record<number, Record<string, number | string>> = useMemo(
    () => initialBalancesAll?.balancesMap ?? {},
    [initialBalancesAll]
  );
  const selectedMemberTags = useMemo(() => {
    if (!addForm.targetUserId || !balancesMap[addForm.targetUserId]) return [];
    return Object.keys(balancesMap[addForm.targetUserId]).filter(k => !k.includes('__'));
  }, [addForm.targetUserId, balancesMap]);

  const { data: allDividendsData, refetch: refetchDividends } = trpc.adminGetAllDividends.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && canManageDividends }
  );

  // 37号标签累计回报、已分红与可分红额由服务端按首页口径统一快照计算。
  const { data: dividendAvailabilityData, refetch: refetchDividendAvailability } = trpc.adminGetLedger37DividendAvailability.useQuery(
    { ledgerId: 37 },
    { enabled: ledgerId === 37 && canManageDividends }
  );
  const availabilityByUserTag = useMemo(() => {
    const byUser = new Map<number, Map<string, any>>();
    for (const user of dividendAvailabilityData?.users ?? []) {
      byUser.set(Number(user.userId), new Map((user.tags ?? []).map((tag: any) => [String(tag.tagName), tag])));
    }
    return byUser;
  }, [dividendAvailabilityData]);
  const selectableMemberTags = useMemo(() => {
    const tagNames = new Set(selectedMemberTags);
    for (const tagName of Array.from(availabilityByUserTag.get(addForm.targetUserId)?.keys() ?? [])) tagNames.add(tagName);
    return Array.from(tagNames);
  }, [addForm.targetUserId, selectedMemberTags, availabilityByUserTag]);

  const dividendsByUser = useMemo(() => {
    const records: any[] = allDividendsData?.records ?? [];
    const map: Record<number, { userName: string; records: any[]; total: number }> = {};
    for (const r of records) {
      if (!map[r.user_id]) {
        const displayName = r.user_nickname || r.user_name || r.user_username || `用户${r.user_id}`;
        map[r.user_id] = { userName: displayName, records: [], total: 0 };
      }
      map[r.user_id].records.push(r);
      map[r.user_id].total += parseFloat(r.amount);
    }
    return map;
  }, [allDividendsData]);

  // 按用户 -> 标签分组。成员尚无分红记录时，也必须显示其可分红标签。
  const tagGroupsByUser = useMemo(() => {
    const result: Record<number, { tagName: string; total: number; records: any[]; isPaused: boolean }[]> = {};
    // 与37号账本首页保持同一口径：最后一次暂停尚未恢复，才视为当前暂停。
    const isTagPaused = (userId: number, tagName: string) => {
      const balances = balancesMap[userId] as Record<string, unknown> | undefined;
      const rawHistory = balances?.[`${tagName}__pauseHistory`];
      if (rawHistory) {
        try {
          const history = JSON.parse(String(rawHistory));
          const last = Array.isArray(history) ? history[history.length - 1] : null;
          return !!last && !last.resumeDate;
        } catch { /* 兼容遗留的暂停日期字段 */ }
      }
      return !!balances?.[`${tagName}__pauseDate`];
    };
    const userIds = new Set<number>([
      ...members.map((member: any) => Number(member.userId)),
      ...Object.keys(dividendsByUser).map(Number),
      ...Array.from(availabilityByUserTag.keys()),
    ]);
    for (const userId of Array.from(userIds)) {
      const recs = dividendsByUser[userId]?.records ?? [];
      const tagMap: Record<string, { tagName: string; total: number; records: any[] }> = {};
      // 先纳入该用户在保证金里涉及的所有标签（即使尚无分红）
      const memberTags = balancesMap[userId] ? Object.keys(balancesMap[userId]).filter(k => !k.includes('__')) : [];
      for (const t of memberTags) {
        tagMap[t] = { tagName: t, total: 0, records: [] };
      }
      // 股票标签或没有传统初始金额的标签由可分红汇总补入。
      for (const t of Array.from(availabilityByUserTag.get(userId)?.keys() ?? [])) {
        if (!tagMap[t]) tagMap[t] = { tagName: t, total: 0, records: [] };
      }
      for (const r of recs) {
        const t = r.tag_name || '未分类';
        if (!tagMap[t]) tagMap[t] = { tagName: t, total: 0, records: [] };
        tagMap[t].records.push(r);
        tagMap[t].total += parseFloat(r.amount);
      }
      // 运行中的标签保持原有顺序；当前暂停、已结束的标签统一沉到该成员列表底部。
      result[userId] = Object.values(tagMap)
        .map(group => ({ ...group, isPaused: isTagPaused(userId, group.tagName) }))
        .sort((left, right) => Number(left.isPaused) - Number(right.isPaused));
    }
    return result;
  }, [dividendsByUser, balancesMap, members, availabilityByUserTag]);

  // 分红操作不能因成员或标签暂停而失去入口。成员目录、余额配置、已有分红和可分红汇总取并集，
  // 兼容历史成员已不在常规成员数组、但仍有待分红或分红记录的情形。
  const dividendMembers = useMemo(() => {
    const memberById = new Map<number, any>();
    const memberOrder = new Map<number, number>();
    members.forEach((member: any, index: number) => {
      const userId = Number(member.userId);
      if (!Number.isFinite(userId) || userId <= 0 || member.memberType === 'ai') return;
      memberById.set(userId, member);
      memberOrder.set(userId, index);
    });
    const userIds = new Set<number>([
      ...members.map((member: any) => Number(member.userId)),
      ...Object.keys(balancesMap).map(Number),
      ...Object.keys(dividendsByUser).map(Number),
      ...Array.from(availabilityByUserTag.keys()),
    ]);
    return Array.from(userIds)
      .filter((userId) => Number.isFinite(userId) && userId > 0 && memberById.get(userId)?.memberType !== 'ai')
      .map((userId) => {
        const member = memberById.get(userId) ?? { userId };
        const groups = tagGroupsByUser[userId] ?? [];
        const activeTagCount = groups.filter((group) => !group.isPaused).length;
        const pausedTagCount = groups.length - activeTagCount;
        const displayName = dividendsByUser[userId]?.userName ?? member.nickname ?? member.realName ?? member.username ?? `用户${userId}`;
        return {
          ...member,
          userId,
          displayName,
          activeTagCount,
          pausedTagCount,
          hasOnlyPausedTags: groups.length > 0 && activeTagCount === 0 && pausedTagCount > 0,
        };
      })
      .sort((left, right) => {
        const leftOrder = memberOrder.get(left.userId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = memberOrder.get(right.userId) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || String(left.displayName).localeCompare(String(right.displayName), 'zh-CN');
      });
  }, [members, balancesMap, dividendsByUser, availabilityByUserTag, tagGroupsByUser]);
  const activeDividendMembers = useMemo(
    () => dividendMembers.filter((member) => !member.hasOnlyPausedTags),
    [dividendMembers],
  );
  const pausedDividendMembers = useMemo(
    () => dividendMembers.filter((member) => member.hasOnlyPausedTags),
    [dividendMembers],
  );
  const dividendMemberRows = useMemo(() => [
    ...activeDividendMembers,
    ...(pausedDividendMembers.length > 0 ? [{ __pausedMemberSection: true, count: pausedDividendMembers.length }] : []),
    ...(showPausedMembers ? pausedDividendMembers : []),
  ], [activeDividendMembers, pausedDividendMembers, showPausedMembers]);

  // ── 普通成员：获取自己的分红明细 ──
  const { data: myDividendData, refetch: refetchMyDividends } = trpc.getDividendRecords.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !isAdmin && !!ledgerData && ledgerId !== 37 }
  );
  const myRecords: any[] = myDividendData?.records ?? [];
  const myTotal = myRecords.reduce((s, r) => s + parseFloat(r.amount), 0);

  // 添加分红（管理员）
  const addMutation = trpc.adminAddDividend.useMutation({
    onSuccess: () => {
      toast.success("分红添加成功");
      setShowAddModal(false);
      setAddForm({ targetUserId: 0, tagName: "", amount: "", assetCode: "CNY", note: "" });
      // 快捷添加模式：保留标签录入状态、清空输入
      setQuickAmount("");
      setQuickNote("");
      setQuickAdd(null);
      refetchDividends();
      refetchDividendAvailability();
    },
    onError: (err) => {
      toast.error(err.message || "添加失败");
    },
  });

  // 删除分红（管理员）
  const deleteMutation = trpc.adminDeleteDividend.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetchDividends();
      refetchDividendAvailability();
    },
    onError: (err) => {
      toast.error(err.message || "删除失败");
    },
  });

  // 编辑分红（管理员）
  const editMutation = trpc.adminEditDividend.useMutation({
    onSuccess: () => {
      toast.success("修改成功");
      setEditRecord(null);
      refetchDividends();
      refetchDividendAvailability();
    },
    onError: (err) => {
      toast.error(err.message || "修改失败");
    },
  });
  const revokeDividendMutation = trpc.adminRevokeLedger37Dividend.useMutation({
    onSuccess: async (result) => {
      toast.success(result.mode === 'reverse' ? '已写入分红冲正流水' : '已直接撤回原分红记录');
      setRevokeDividendRecord(null);
      await Promise.all([refetchDividends(), refetchDividendAvailability()]);
    },
    onError: (err) => toast.error(err.message || '分红撤回失败'),
  });

  // 修改备注（用户）
  const updateNoteMutation = trpc.updateDividendNote.useMutation({
    onSuccess: () => {
      toast.success("备注已更新");
      setEditingNoteId(null);
      refetchMyDividends();
    },
    onError: (err) => {
      toast.error(err.message || "更新失败");
    },
  });

  const handleAddSubmit = () => {
    if (!addForm.targetUserId) return toast.error("请选择成员");
    if (!addForm.tagName) return toast.error("请选择标签");
    const amount = parseFloat(addForm.amount);
    if (!amount || amount <= 0) return toast.error("请输入有效金额");
    addMutation.mutate({
      ledgerId,
      targetUserId: addForm.targetUserId,
      tagName: addForm.tagName,
      amount,
      ...(ledgerId === 37 ? { assetCode: addForm.assetCode, assetAmount: addForm.amount } : {}),
      note: addForm.note || undefined,
    });
  };

  const handleEditSubmit = () => {
    if (!editRecord) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) return toast.error("请输入有效金额");
    editMutation.mutate({
      ledgerId,
      recordId: editRecord.id,
      amount,
      note: editNote || undefined,
    });
  };

  const handleNoteSubmit = (recordId: number) => {
    updateNoteMutation.mutate({
      ledgerId,
      recordId,
      note: editingNoteText,
    });
  };

  // 标签内快捷添加一笔分红
  const handleQuickAddSubmit = () => {
    if (!quickAdd) return;
    const amount = parseFloat(quickAmount);
    if (!amount || amount <= 0) return toast.error("请输入有效金额");
    addMutation.mutate({
      ledgerId,
      targetUserId: quickAdd.userId,
      tagName: quickAdd.tagName,
      amount,
      note: quickNote || undefined,
    });
  };

  // 数据加载中
  if (!ledgerData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <span style={{ color: '#9E9E9E' }}>加载中...</span>
      </div>
    );
  }

  if (ledgerId === 37 && !canManageDividends) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ backgroundColor: '#F5F5F5' }}>
        <div>
          <div className="text-base font-semibold" style={{ color: '#424242' }}>无权访问分红管理</div>
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="mt-4 px-4 py-2 text-sm" style={{ color: '#D32F2F' }}>返回账本</button>
        </div>
      </div>
    );
  }

  // ── 普通成员视图 ──
  if (!isAdmin) {
    return (
      <div className="min-h-screen pb-20 max-w-md mx-auto" style={{ backgroundColor: '#F5F5F5' }}>
        {/* 顶部导航 */}
        <div className="sticky top-0 z-10 flex items-center px-4 py-3 border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#F0F0F0' }}>
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="mr-3">
            <ChevronLeft className="w-5 h-5" style={{ color: '#424242' }} />
          </button>
          <span className="text-base font-semibold flex-1" style={{ color: '#1A1A1A' }}>我的分红</span>
        </div>

        {/* 汇总卡片 */}
        <div className="px-3 mt-3">
          <div className="rounded-2xl px-4 py-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="text-xs mb-1" style={{ color: '#9E9E9E' }}>累计分红</div>
            <div className="text-2xl font-bold" style={{ color: myTotal > 0 ? '#D32F2F' : '#BDBDBD' }}>
              {myTotal > 0 ? `¥${myTotal.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
            </div>
            <div className="text-xs mt-1" style={{ color: '#BDBDBD' }}>共 {myRecords.length} 笔</div>
          </div>
        </div>

        {/* 明细列表 */}
        <div className="px-3 mt-3 space-y-2">
          {myRecords.length === 0 && (
            <div className="text-center py-10" style={{ color: '#BDBDBD' }}>暂无分红记录</div>
          )}
          {myRecords.map((rec: any) => (
            <div key={rec.id} className="rounded-2xl px-4 py-3 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF3E0', color: '#E65100' }}>
                      {rec.tag_name}
                    </span>
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: '#BDBDBD' }}>
                    {new Date(rec.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </div>
                </div>
                <div className="text-sm font-semibold mr-2" style={{ color: '#D32F2F' }}>
                  ¥{parseFloat(rec.amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                </div>
                {/* 编辑备注按钮 */}
                {editingNoteId === rec.id ? null : (
                  <button
                    onClick={() => { setEditingNoteId(rec.id); setEditingNoteText(rec.note ?? ''); }}
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: '#F5F5F5' }}
                  >
                    <Pencil className="w-3.5 h-3.5" style={{ color: '#9E9E9E' }} />
                  </button>
                )}
              </div>
              {/* 备注行内编辑 */}
              {editingNoteId === rec.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={editingNoteText}
                    onChange={e => setEditingNoteText(e.target.value)}
                    placeholder="添加备注..."
                    className="flex-1 px-3 py-1.5 rounded-xl text-xs outline-none border"
                    style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleNoteSubmit(rec.id)}
                    disabled={updateNoteMutation.isPending}
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: '#E8F5E9' }}
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: '#388E3C' }} />
                  </button>
                  <button
                    onClick={() => setEditingNoteId(null)}
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: '#F5F5F5' }}
                  >
                    <X className="w-3.5 h-3.5" style={{ color: '#9E9E9E' }} />
                  </button>
                </div>
              ) : rec.note ? (
                <div className="mt-1 text-xs" style={{ color: '#9E9E9E' }}>{rec.note}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 管理员视图 ──
  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto" style={{ backgroundColor: '#F5F5F5' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 flex items-center px-4 py-3 border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#F0F0F0' }}>
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="mr-3">
          <ChevronLeft className="w-5 h-5" style={{ color: '#424242' }} />
        </button>
        <span className="text-base font-semibold flex-1" style={{ color: '#1A1A1A' }}>分红管理</span>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium"
          style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
        >
          <Plus className="w-4 h-4" />
          添加分红
        </button>
      </div>

      {/* 成员分红列表 */}
      <div className="px-3 mt-3 space-y-3">
        {dividendMembers.length === 0 && (
          <div className="text-center py-10" style={{ color: '#BDBDBD' }}>暂无成员数据</div>
        )}
        {dividendMemberRows.map((member: any) => {
          if (member.__pausedMemberSection) {
            return (
              <button
                key="paused-members-section"
                type="button"
                onClick={() => {
                  if (showPausedMembers) {
                    setShowPausedMembers(false);
                    setExpandedUserId((currentUserId) => pausedDividendMembers.some((pausedMember) => Number(pausedMember.userId) === Number(currentUserId)) ? null : currentUserId);
                    setExpandedPausedTagsUserId(null);
                  } else {
                    setShowPausedMembers(true);
                  }
                }}
                className="flex w-full items-center rounded-2xl px-4 py-3 text-left shadow-sm"
                style={{ backgroundColor: '#F1F7FF', border: '1px solid #D7E8FA', color: '#1565C0' }}
              >
                <PauseCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-sm font-semibold">已暂停成员</span>
                <span className="mr-2 text-[11px] font-medium">{member.count} 人 · 仍可分红</span>
                {showPausedMembers ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
              </button>
            );
          }
          const userId = Number(member.userId);
          const userDiv = dividendsByUser[userId];
          const total = userDiv?.total ?? 0;
          const records = userDiv?.records ?? [];
          const isExpanded = expandedUserId === userId;
          const memberTagGroups = tagGroupsByUser[userId] ?? [];
          const activeTagGroups = memberTagGroups.filter((group) => !group.isPaused);
          const pausedTagGroups = memberTagGroups.filter((group) => group.isPaused);
          const hasPausedTagSection = pausedTagGroups.length > 0 && !member.hasOnlyPausedTags;
          const isPausedTagSectionExpanded = expandedPausedTagsUserId === userId;
          const displayedTagRows: any[] = [
            ...activeTagGroups,
            ...(hasPausedTagSection ? [{ __pausedTagSection: true, count: pausedTagGroups.length }] : []),
            ...(!hasPausedTagSection || isPausedTagSectionExpanded ? pausedTagGroups : []),
          ];

          return (
            <div key={userId} className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              {/* 成员行 */}
              <div
                className="flex items-center px-4 py-3 cursor-pointer"
                onClick={() => setExpandedUserId(isExpanded ? null : userId)}
              >
                {ledgerId === 37 && canManageDividends ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setWalletSnapshotUser({
                        id: Number(userId),
                        name: member.displayName,
                        username: member.username ?? undefined,
                      });
                    }}
                    className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2"
                    title={`查看 ${member.displayName} 的只读钱包快照`}
                    aria-label={`查看 ${member.displayName} 的只读钱包快照`}
                  >
                    <UserAvatar
                      username={member.username ?? `用户${userId}`}
                      nickname={member.nickname ?? null}
                      avatar={member.avatar ?? null}
                      size="sm"
                    />
                  </button>
                ) : (
                  <UserAvatar
                    username={member.username ?? `用户${userId}`}
                    nickname={member.nickname ?? null}
                    avatar={member.avatar ?? null}
                    size="sm"
                  />
                )}
                <div className="ml-3 flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{member.displayName}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#9E9E9E' }}>
                    {records.length > 0 ? `共 ${records.length} 笔分红` : '暂无分红记录'}
                  </div>
                </div>
                <div className="text-right mr-2">
                  <div className="text-sm font-semibold" style={{ color: total > 0 ? '#D32F2F' : '#BDBDBD' }}>
                    {total > 0 ? `¥${total.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                  </div>
                  <div className="text-[10px]" style={{ color: '#BDBDBD' }}>累计分红</div>
                </div>
                {memberTagGroups.length > 0 && (
                  isExpanded
                    ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />
                    : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />
                )}
              </div>

              {/* 标签分组（第一级：每个标签汇总；点开第二级：该标签下每笔明细） */}
              {isExpanded && memberTagGroups.length > 0 && (
                <div style={{ borderTop: '1px solid #F5F5F5' }}>
                  {displayedTagRows.map((grp: any) => {
                    if (grp.__pausedTagSection) {
                      return (
                        <button
                          key={`${userId}__paused-tags-section`}
                          type="button"
                          onClick={() => setExpandedPausedTagsUserId(isPausedTagSectionExpanded ? null : userId)}
                          className="flex w-full items-center px-4 py-2.5 text-left"
                          style={{ backgroundColor: '#F1F7FF', borderTop: '1px solid #D7E8FA', color: '#1565C0' }}
                        >
                          <PauseCircle className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                          <span className="flex-1 text-xs font-semibold">已暂停标签</span>
                          <span className="mr-2 text-[10px] font-medium">{grp.count} 项 · 仍可分红</span>
                          {isPausedTagSectionExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                        </button>
                      );
                    }
                    const tagKey = `${userId}__${grp.tagName}`;
                    const tagExpanded = expandedTagKey === tagKey;
                    const availability = availabilityByUserTag.get(Number(userId))?.get(grp.tagName);
                    const formatCny = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
                    const cumulativeReturn = Number(availability?.cumulativeReturn ?? 0);
                    const paidDividend = Number(availability?.paidDividend ?? 0);
                    const availableAmount = Number(availability?.availableDividend ?? 0);
                    const tagPillBackground = grp.isPaused ? '#E3F2FD' : '#FFF3E0';
                    const tagPillColor = grp.isPaused ? '#1565C0' : '#E65100';
                    // 一条完整进度条由三项金额按绝对值比例依次分段，负值仍以其规模参与比例并保留蓝色提示。
                    const dividendProgressTotal = Math.abs(cumulativeReturn) + Math.abs(paidDividend) + Math.abs(availableAmount);
                    const segmentWidth = (value: number) => dividendProgressTotal > 0
                      ? `${(Math.abs(value) / dividendProgressTotal) * 100}%`
                      : '0%';
                    const cumulativeColor = '#5C6BC0';
                    const paidColor = '#EF6C00';
                    const availabilityColor = availableAmount > 0 ? '#2E7D32' : availableAmount < 0 ? '#1565C0' : '#9E9E9E';
                    return (
                      <div key={tagKey} style={{ borderBottom: '1px solid #E3EDF9', backgroundColor: grp.isPaused ? '#F7FAFF' : '#FFFFFF' }}>
                        {/* 标签汇总行 */}
                        <div
                          className="flex items-center px-4 py-2.5 cursor-pointer"
                          style={{ backgroundColor: grp.isPaused ? '#EFF6FF' : '#FAFAFA', borderLeft: grp.isPaused ? '3px solid #1565C0' : '3px solid transparent' }}
                          onClick={() => setExpandedTagKey(tagExpanded ? null : tagKey)}
                        >
                          {ledgerId === 37 && availability ? (
                            <div className="flex-1 min-w-0 mr-2">
                              {/* 第一行仅呈现标签与分红笔数，避免和计算公式混排。 */}
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full truncate" style={{ backgroundColor: tagPillBackground, color: tagPillColor }}>
                                  {grp.tagName}
                                </span>
                                <span className="text-[10px] flex-shrink-0" style={{ color: '#9E9E9E' }}>
                                  共 {grp.records.length} 笔
                                </span>
                                {grp.isPaused && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-semibold flex-shrink-0" style={{ color: '#1565C0' }}>
                                    <PauseCircle className="w-3 h-3" /> 暂停
                                  </span>
                                )}
                              </div>
                              {/* 第二行用三色、三等宽统计块呈现。 */}
                              <div className="grid grid-cols-3 gap-1 mt-1.5">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium" style={{ color: cumulativeColor }}>累计回报</div>
                                  <div className="text-[13px] leading-5 font-semibold tabular-nums whitespace-nowrap" style={{ color: cumulativeColor }}>{formatCny(cumulativeReturn)}</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium" style={{ color: paidColor }}>已分红</div>
                                  <div className="text-[13px] leading-5 font-semibold tabular-nums whitespace-nowrap" style={{ color: paidColor }}>{formatCny(paidDividend)}</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium" style={{ color: availabilityColor }}>可分红</div>
                                  <div className="text-[13px] leading-5 font-semibold tabular-nums whitespace-nowrap" style={{ color: availabilityColor }}>{formatCny(availableAmount)}</div>
                                </div>
                              </div>
                              {/* 与整个标签等宽的三色比例条：累计回报 / 已分红 / 可分红。 */}
                              <div className="mt-2 h-2 w-full rounded-full overflow-hidden flex" style={{ backgroundColor: '#ECEFF1' }}>
                                <div className="h-full" style={{ width: segmentWidth(cumulativeReturn), backgroundColor: cumulativeColor }} />
                                <div className="h-full" style={{ width: segmentWidth(paidDividend), backgroundColor: paidColor }} />
                                <div className="h-full" style={{ width: segmentWidth(availableAmount), backgroundColor: availabilityColor }} />
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: tagPillBackground, color: tagPillColor }}>
                                {grp.tagName}
                              </span>
                              <div className="ml-2 min-w-0">
                                <div className="text-[10px]" style={{ color: '#9E9E9E' }}>
                                  共 {grp.records.length} 笔
                                </div>
                              </div>
                              {grp.isPaused && (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold ml-2 flex-shrink-0" style={{ color: '#1565C0' }}>
                                  <PauseCircle className="w-3 h-3" /> 暂停
                                </span>
                              )}
                              <div className="flex-1" />
                              <div className="text-right mr-2 whitespace-nowrap">
                                <div className="text-sm font-semibold" style={{ color: grp.total > 0 ? '#D32F2F' : '#BDBDBD' }}>
                                  {grp.total > 0 ? `¥${grp.total.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                                </div>
                              </div>
                            </>
                          )}
                          {tagExpanded
                            ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />
                            : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />}
                        </div>

                        {/* 第二级：该标签下每笔明细 + 标签操作区 */}
                        {tagExpanded && (
                          <div style={{ backgroundColor: grp.isPaused ? '#F7FAFF' : '#FFFFFF' }}>
                            {grp.records.map((rec: any) => (
                              <div key={rec.id} className="flex items-center px-6 py-2" style={{ borderTop: '1px solid #FAFAFA' }}>
                                <div className="flex-1 min-w-0">
                                  {rec.note && (
                                    <div className="text-xs truncate" style={{ color: '#9E9E9E' }}>{rec.note}</div>
                                  )}
                                  <div className="text-[10px] mt-0.5" style={{ color: '#BDBDBD' }}>
                                    {new Date(rec.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold mr-2" style={{ color: Number(rec.amount) < 0 ? '#2E7D32' : '#D32F2F' }}>
                                  {String(rec.asset_code || 'CNY').toUpperCase() === 'CNY'
                                    ? `¥${parseFloat(rec.asset_amount ?? rec.amount).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
                                    : `${Number(rec.asset_amount ?? rec.amount).toLocaleString('zh-CN', { maximumFractionDigits: 8 })} ${String(rec.asset_code).toUpperCase()}`}
                                </div>
                                {ledgerId === 37 && rec.wallet_request_id ? (
                                  Number(rec.reversal_of_id || 0) > 0 ? (
                                    <span className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ color: '#2E7D32', backgroundColor: '#E8F5E9' }}>冲正流水</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setRevokeDividendRecord(rec)}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium"
                                      style={{ backgroundColor: '#EAF3FF', color: '#1565C0' }}
                                      title="撤回或冲正这笔已入账分红"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" /> 撤回
                                    </button>
                                  )
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditRecord(rec);
                                        setEditAmount(String(parseFloat(rec.amount)));
                                        setEditNote(rec.note ?? '');
                                      }}
                                      className="p-1.5 rounded-lg mr-1"
                                      style={{ backgroundColor: '#FFF8E1' }}
                                    >
                                      <Pencil className="w-3.5 h-3.5" style={{ color: '#F57F17' }} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm('确认删除这笔分红记录？')) {
                                          deleteMutation.mutate({ ledgerId, recordId: rec.id });
                                        }
                                      }}
                                      className="p-1.5 rounded-lg"
                                      style={{ backgroundColor: '#FFF5F5' }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF5350' }} />
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}

                            {/* 标签操作区：快捷加一笔分红 + 标签备注 */}
                            <div className="px-6 py-2 flex items-center gap-2" style={{ borderTop: '1px solid #FAFAFA' }}>
                              {quickAdd && quickAdd.userId === userId && quickAdd.tagName === grp.tagName ? (
                                <div className="flex-1 flex items-center gap-2">
                                  <input
                                    type="number"
                                    placeholder="金额"
                                    value={quickAmount}
                                    onChange={e => setQuickAmount(e.target.value)}
                                    className="w-20 px-2 py-1.5 rounded-lg text-xs outline-none border"
                                    style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    placeholder="备注(选填)"
                                    value={quickNote}
                                    onChange={e => setQuickNote(e.target.value)}
                                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none border"
                                    style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                                  />
                                  <button
                                    onClick={handleQuickAddSubmit}
                                    disabled={addMutation.isPending}
                                    className="p-1.5 rounded-lg flex-shrink-0"
                                    style={{ backgroundColor: '#E8F5E9' }}
                                  >
                                    <Check className="w-3.5 h-3.5" style={{ color: '#388E3C' }} />
                                  </button>
                                  <button
                                    onClick={() => { setQuickAdd(null); setQuickAmount(''); setQuickNote(''); }}
                                    className="p-1.5 rounded-lg flex-shrink-0"
                                    style={{ backgroundColor: '#F5F5F5' }}
                                  >
                                    <X className="w-3.5 h-3.5" style={{ color: '#9E9E9E' }} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => { setQuickAdd({ userId, tagName: grp.tagName }); setQuickAmount(''); setQuickNote(''); }}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                                    style={{ backgroundColor: '#FFEBEE', color: '#D32F2F' }}
                                  >
                                    <Plus className="w-3.5 h-3.5" /> 加一笔
                                  </button>
                                  <button
                                    onClick={() => setShowNoteModal({ userId, userName: member.displayName, tagName: grp.tagName })}
                                    className="px-2.5 py-1 rounded-full text-xs font-medium underline"
                                    style={{ color: '#1565C0' }}
                                  >
                                    标签备注{(noteCounts[`${userId}|${grp.tagName}`] ?? 0) > 0 ? ` (${noteCounts[`${userId}|${grp.tagName}`]})` : ''}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 添加分红弹窗 */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 480, maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>添加分红</span>
              <button onClick={() => setShowAddModal(false)} className="text-sm" style={{ color: '#9E9E9E' }}>取消</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
              {/* 选择成员 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>选择成员</div>
                <div className="flex flex-wrap gap-2">
                  {dividendMembers.map((m: any) => (
                    <button
                      key={m.userId}
                      onClick={() => setAddForm(f => ({ ...f, targetUserId: m.userId, tagName: "" }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                      style={{
                        backgroundColor: addForm.targetUserId === m.userId ? '#D32F2F' : '#FAFAFA',
                        color: addForm.targetUserId === m.userId ? '#FFFFFF' : '#424242',
                        borderColor: addForm.targetUserId === m.userId ? '#D32F2F' : '#E0E0E0',
                      }}
                    >
                      {m.displayName}{m.hasOnlyPausedTags ? ' · 暂停' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* 选择标签 */}
              {addForm.targetUserId > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>选择标签</div>
                  <div className="flex flex-wrap gap-2">
                    {selectableMemberTags.map((tagName: string) => {
                      const availability = availabilityByUserTag.get(addForm.targetUserId)?.get(tagName);
                      const availableAmount = Number(availability?.availableDividend ?? 0);
                      return (
                      <button
                        key={tagName}
                        onClick={() => setAddForm(f => ({ ...f, tagName }))}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                        style={{
                          backgroundColor: addForm.tagName === tagName ? '#D32F2F' : '#FAFAFA',
                          color: addForm.tagName === tagName ? '#FFFFFF' : '#424242',
                          borderColor: addForm.tagName === tagName ? '#D32F2F' : '#E0E0E0',
                        }}
                      >
                        {tagName}{ledgerId === 37 && availability ? ` · 可分红 ¥${availableAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : ''}
                      </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 币种与金额 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>{ledgerId === 37 ? '入账币种与数量' : '分红金额（¥）'}</div>
                <div className={ledgerId === 37 ? 'grid grid-cols-[108px_1fr] gap-2' : ''}>
                  {ledgerId === 37 && (
                    <select value={addForm.assetCode} onChange={e => setAddForm(f => ({ ...f, assetCode: e.target.value }))} className="rounded-xl border bg-white px-2 text-sm outline-none" style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}>
                      <option value="CNY">人民币 CNY</option>
                      <option value="USDT">USDT</option>
                      {AI_WALLET_CRYPTO_MARKET_ASSETS.map((asset) => <option key={asset} value={asset}>{asset}</option>)}
                    </select>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={ledgerId === 37 ? `请输入${addForm.assetCode}数量` : '请输入金额'}
                    value={addForm.amount}
                    onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border"
                    style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                  />
                </div>
                {ledgerId === 37 && <div className="mt-1.5 text-[11px]" style={{ color: '#78909C' }}>确认后按原币种直接入账至成员全局钱包；页面中的回报统计保留人民币估值快照。</div>}
              </div>

              {/* 备注 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>备注（选填）</div>
                <input
                  type="text"
                  placeholder="如：2025年Q1分红"
                  value={addForm.note}
                  onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                />
              </div>

              {/* 提交按钮 */}
              <button
                onClick={handleAddSubmit}
                disabled={addMutation.isPending}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#D32F2F', color: '#FFFFFF', opacity: addMutation.isPending ? 0.6 : 1 }}
              >
                {addMutation.isPending ? '提交中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员备注弹窗 */}
      {showNoteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowNoteModal(null)}
        >
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 480, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>分红备注 - {showNoteModal.userName} · {showNoteModal.tagName}</span>
              <button onClick={() => setShowNoteModal(null)} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
            </div>

            <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: '50vh' }}>
              {/* 添加新备注 */}
              <div className="flex gap-2 mb-4 items-start">
                <textarea
                  placeholder="输入备注内容（可输入多行）"
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  rows={3}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none border resize-y"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A', minHeight: 72, lineHeight: 1.5 }}
                />
                <button
                  onClick={() => {
                    if (!newNoteContent.trim()) return toast.error("请输入备注内容");
                    addNoteMutation.mutate({ ledgerId, userId: showNoteModal.userId, tagName: showNoteModal.tagName, type: 'dividend', content: newNoteContent.trim() });
                  }}
                  disabled={addNoteMutation.isPending}
                  className="px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
                >
                  添加
                </button>
              </div>

              {/* 备注列表 */}
              {(notesData?.notes ?? []).length === 0 ? (
                <div className="text-center py-6" style={{ color: '#BDBDBD' }}>暂无备注</div>
              ) : (
                <div className="space-y-2">
                  {(notesData?.notes ?? []).map((note: any) => (
                    <div key={note.id} className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs" style={{ color: '#9E9E9E' }}>
                          {new Date(note.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </div>
                        <div className="text-sm mt-0.5" style={{ color: '#1A1A1A', whiteSpace: 'pre-wrap' }}>{note.content}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('确认删除此备注？')) {
                            deleteNoteMutation.mutate({ ledgerId, noteId: note.id });
                          }
                        }}
                        className="p-1 rounded flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF5350' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑分红弹窗（管理员） */}
      {editRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setEditRecord(null)}
        >
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 480 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>编辑分红</span>
              <button onClick={() => setEditRecord(null)} className="text-sm" style={{ color: '#9E9E9E' }}>取消</button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* 标签（只读） */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>标签</div>
                <div className="px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor: '#F5F5F5', color: '#757575' }}>
                  {editRecord.tag_name}
                </div>
              </div>

              {/* 金额 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>分红金额（¥）</div>
                <input
                  type="number"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                  autoFocus
                />
              </div>

              {/* 备注 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>备注</div>
                <input
                  type="text"
                  placeholder="如：2025年Q1分红"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                />
              </div>

              {/* 提交按钮 */}
              <button
                onClick={handleEditSubmit}
                disabled={editMutation.isPending}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#D32F2F', color: '#FFFFFF', opacity: editMutation.isPending ? 0.6 : 1 }}
              >
                {editMutation.isPending ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeDividendRecord && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/50" onClick={() => setRevokeDividendRecord(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: '#1A1A1A' }}>撤回已入账分红</h3>
            <div className="mt-1 text-sm" style={{ color: '#757575' }}>
              {String(revokeDividendRecord.asset_code || 'CNY').toUpperCase() === 'CNY'
                ? `分红金额：¥${Number(revokeDividendRecord.asset_amount ?? revokeDividendRecord.amount).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
                : `分红数量：${Number(revokeDividendRecord.asset_amount ?? revokeDividendRecord.amount).toLocaleString('zh-CN', { maximumFractionDigits: 8 })} ${String(revokeDividendRecord.asset_code).toUpperCase()}`}
            </div>
            <p className="mt-1 text-xs leading-5" style={{ color: '#9E9E9E' }}>仅当该资产当前仍可用时才能执行；已被消费或再次冻结的资金会被安全拦截。</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                disabled={revokeDividendMutation.isPending}
                onClick={() => revokeDividendMutation.mutate({ ledgerId: 37, recordId: Number(revokeDividendRecord.id), mode: 'reverse' })}
                className="w-full rounded-xl border px-4 py-3 text-left disabled:opacity-50"
                style={{ borderColor: '#BBE0C2', backgroundColor: '#F0F9F1', color: '#237A39' }}
              >
                <div className="text-sm font-semibold">写入反向冲正记录（推荐）</div>
                <div className="mt-0.5 text-xs leading-5">保留原分红，并新增一笔同金额的负向冲正；钱包余额与可分红额同步还原，便于审计。</div>
              </button>
              <button
                type="button"
                disabled={revokeDividendMutation.isPending}
                onClick={() => revokeDividendMutation.mutate({ ledgerId: 37, recordId: Number(revokeDividendRecord.id), mode: 'delete' })}
                className="w-full rounded-xl border px-4 py-3 text-left disabled:opacity-50"
                style={{ borderColor: '#F3CDD1', backgroundColor: '#FFF5F5', color: '#C62828' }}
              >
                <div className="text-sm font-semibold">直接撤回原分红记录</div>
                <div className="mt-0.5 text-xs leading-5">移除原分红及其钱包入账流水，不新增面向成员的冲正流水。</div>
              </button>
            </div>
            <button type="button" onClick={() => setRevokeDividendRecord(null)} className="mt-4 w-full rounded-xl border py-2.5 text-sm" style={{ borderColor: '#E0E0E0', color: '#757575' }}>取消</button>
          </div>
        </div>
      )}

      {walletSnapshotUser && (
        walletSnapshotQuery.isLoading ? (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65" onClick={() => setWalletSnapshotUser(null)}>
            <div className="rounded-2xl px-6 py-5 text-center" style={{ background: '#151515', border: '1px solid rgba(201,168,76,.5)' }} onClick={(event) => event.stopPropagation()}>
              <div className="text-sm font-semibold text-[#f5d78e]">正在读取钱包实时快照…</div>
              <div className="mt-1 text-xs text-white/45">仅加载该37号账本成员的只读资产与资金明细</div>
            </div>
          </div>
        ) : walletSnapshotQuery.error ? (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 px-6" onClick={() => setWalletSnapshotUser(null)}>
            <div className="w-full max-w-sm rounded-2xl px-5 py-5 text-center" style={{ background: '#151515', border: '1px solid rgba(248,113,113,.55)' }} onClick={(event) => event.stopPropagation()}>
              <div className="text-sm font-semibold text-red-300">钱包快照暂时无法读取</div>
              <div className="mt-1 text-xs leading-5 text-white/55">{walletSnapshotQuery.error.message || '请稍后重新打开，不会影响成员钱包或分红。'}</div>
              <div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => walletSnapshotQuery.refetch()} className="rounded-lg bg-[#C9A84C] px-4 py-2 text-xs font-semibold text-[#151515]">重新读取</button><button type="button" onClick={() => setWalletSnapshotUser(null)} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white/70">关闭</button></div>
            </div>
          </div>
        ) : walletSnapshotQuery.data ? (
          <ReadonlyWalletSnapshot snapshot={walletSnapshotQuery.data} onClose={() => setWalletSnapshotUser(null)} />
        ) : null
      )}
    </div>
  );
}
