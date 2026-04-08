/**
 * LedgerAADividendManage.tsx
 * 定制账本(AA) 分红管理页
 * 仅账本创建人(owner)和管理员(admin)可访问
 *
 * 功能：
 *  - 查看所有成员的分红记录汇总
 *  - 为指定成员的指定标签添加分红
 *  - 查看/删除每笔分红明细
 */
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
// UserAvatar props: username, avatar, nickname, size (sm/md/lg)

export default function LedgerAADividendManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    targetUserId: 0,
    tagName: "",
    amount: "",
    note: "",
  });

  // 展开某个成员的明细
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // 获取账本信息（权限校验）
  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 从balancesMap中获取选中成员的标签列表
  const balancesMap: Record<number, Record<string, number>> = useMemo(
    () => initialBalancesAll?.balancesMap ?? {},
    [initialBalancesAll]
  );
  const selectedMemberTags = useMemo(() => {
    if (!addForm.targetUserId || !balancesMap[addForm.targetUserId]) return [];
    return Object.keys(balancesMap[addForm.targetUserId]);
  }, [addForm.targetUserId, balancesMap]);

  // 获取所有成员分红记录
  const { data: allDividendsData, refetch: refetchDividends } = trpc.adminGetAllDividends.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 获取成员列表（用于显示头像和姓名）
  const { data: initialBalancesAll } = trpc.ledger.adminGetAllInitialBalances.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const members: any[] = useMemo(() => initialBalancesAll?.members ?? [], [initialBalancesAll]);

  // 按用户分组分红记录
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

  // 添加分红
  const addMutation = trpc.adminAddDividend.useMutation({
    onSuccess: () => {
      toast.success("分红添加成功");
      setShowAddModal(false);
      setAddForm({ targetUserId: 0, tagName: "", amount: "", note: "" });
      refetchDividends();
    },
    onError: (err) => {
      toast.error(err.message || "添加失败");
    },
  });

  // 删除分红
  const deleteMutation = trpc.adminDeleteDividend.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetchDividends();
    },
    onError: (err) => {
      toast.error(err.message || "删除失败");
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
      note: addForm.note || undefined,
    });
  };

  const canEdit = ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin';

  if (!canEdit) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <span style={{ color: '#9E9E9E' }}>无权限访问</span>
      </div>
    );
  }

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
        {members.length === 0 && (
          <div className="text-center py-10" style={{ color: '#BDBDBD' }}>暂无成员数据</div>
        )}
        {members.map((member: any) => {
          const userId = member.userId;
          const userDiv = dividendsByUser[userId];
          const total = userDiv?.total ?? 0;
          const records = userDiv?.records ?? [];
          const isExpanded = expandedUserId === userId;

          return (
            <div key={userId} className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              {/* 成员行 */}
              <div
                className="flex items-center px-4 py-3 cursor-pointer"
                onClick={() => setExpandedUserId(isExpanded ? null : userId)}
              >
                <UserAvatar username={member.nickname ?? member.username ?? `用户${userId}`} size="sm" />
                <div className="ml-3 flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{userDiv?.userName ?? member.nickname ?? member.username ?? `用户${userId}`}</div>
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
                {records.length > 0 && (
                  isExpanded
                    ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />
                    : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#BDBDBD' }} />
                )}
              </div>

              {/* 明细列表 */}
              {isExpanded && records.length > 0 && (
                <div style={{ borderTop: '1px solid #F5F5F5' }}>
                  {records.map((rec: any) => (
                    <div key={rec.id} className="flex items-center px-4 py-2.5" style={{ borderBottom: '1px solid #FAFAFA' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF3E0', color: '#E65100' }}>
                            {rec.tag_name}
                          </span>
                          {rec.note && (
                            <span className="text-xs truncate" style={{ color: '#9E9E9E' }}>{rec.note}</span>
                          )}
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: '#BDBDBD' }}>
                          {new Date(rec.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </div>
                      </div>
                      <div className="text-sm font-semibold mr-3" style={{ color: '#D32F2F' }}>
                        ¥{parseFloat(rec.amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                      </div>
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
                    </div>
                  ))}
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
            style={{ backgroundColor: '#FFFFFF', maxWidth: 480 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>添加分红</span>
              <button onClick={() => setShowAddModal(false)} className="text-sm" style={{ color: '#9E9E9E' }}>取消</button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* 选择成员 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>选择成员</div>
                <div className="flex flex-wrap gap-2">
                    {members.map((m: any) => (
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
                      {m.nickname ?? m.username ?? `用户${m.userId}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 选择标签 */}
              {addForm.targetUserId > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>选择标签</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMemberTags.map((tagName: string) => (
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
                        {tagName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 金额 */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#757575' }}>分红金额（¥）</div>
                <input
                  type="number"
                  placeholder="请输入金额"
                  value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A' }}
                />
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
    </div>
  );
}
