import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Building2, FileText, Shield, Calculator, Users, UserPlus, X, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AhCompanyWorkspace() {
  const [, params] = useRoute("/ledger/:id/company/:companyId");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id);
  const companyId = Number(params?.companyId);

  const [activeTab, setActiveTab] = useState<'tax' | 'social' | 'accounting' | 'members'>('members');
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<'client' | 'employee'>('client');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNote, setEditNote] = useState('');

  // 获取公司详情
  const { data: company, isLoading: companyLoading, refetch: refetchCompany } = trpc.ledger.ahGetCompanyDetail.useQuery(
    { ledgerId, companyId },
    { enabled: !!ledgerId && !!companyId }
  );

  // 更新公司信息
  const updateCompanyMutation = trpc.ledger.ahUpdateCompany.useMutation({
    onSuccess: () => {
      toast.success('公司信息已更新');
      refetchCompany();
      setIsEditing(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startEditing = () => {
    const c = company as any;
    setEditName(c?.name || '');
    setEditContact(c?.contactName || '');
    setEditPhone(c?.contactPhone || '');
    setEditTaxId(c?.taxId || '');
    setEditAddress(c?.address || '');
    setEditNote(c?.note || '');
    setIsEditing(true);
  };

  // 获取公司成员列表
  const { data: companyMembers, refetch: refetchMembers } = trpc.ledger.ahGetCompanyMembers.useQuery(
    { ledgerId, companyId },
    { enabled: !!ledgerId && !!companyId }
  );

  // 获取账本成员列表（用于选择要添加的用户）
  const { data: ledgerMembers } = trpc.ledger.getMembers.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && showAddMember }
  );

  // 获取当前用户角色
  const { data: ledgerDetail } = trpc.ledger.getDetail.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const userRole = (ledgerDetail as any)?.userRole;
  const isAdmin = ['owner', 'admin'].includes(userRole);

  // 添加成员
  const addMemberMutation = trpc.ledger.ahAddCompanyMember.useMutation({
    onSuccess: () => {
      toast.success('成员添加成功');
      refetchMembers();
      setShowAddMember(false);
      setSelectedUserId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // 移除成员
  const removeMemberMutation = trpc.ledger.ahRemoveCompanyMember.useMutation({
    onSuccess: () => {
      toast.success('成员已移除');
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });

  // 过滤掉已经绑定到此公司的用户
  const availableMembers = (ledgerMembers as any[] || []).filter((m: any) => {
    const alreadyBound = (companyMembers || []).some((cm: any) => cm.userId === m.userId);
    return !alreadyBound;
  });

  if (companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F7FA' }}>
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  const tabs = [
    { key: 'members' as const, label: '人员', icon: Users, color: '#7C3AED' },
    { key: 'tax' as const, label: '报税', icon: FileText, color: '#1A56DB' },
    { key: 'social' as const, label: '社保', icon: Shield, color: '#059669' },
    { key: 'accounting' as const, label: '记账', icon: Calculator, color: '#D97706' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F7FA' }}>
      {/* 顶部蓝色区域 */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1A56DB 50%, #3B82F6 100%)',
        paddingTop: '44px',
        paddingBottom: '20px',
      }}>
        {/* 导航栏 */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="flex items-center gap-1 text-white/90">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>
          <div className="text-white font-medium text-base">{(company as any)?.name || '公司工作台'}</div>
          {isAdmin && (
            <button onClick={startEditing} className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Pencil className="w-4 h-4 text-white" />
            </button>
          )}
          {!isAdmin && <div className="w-12" />}
        </div>

        {/* 公司信息卡片 */}
        <div className="mx-4 mt-2 rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white font-medium text-lg">{(company as any)?.name}</div>
              {(company as any)?.taxId && <div className="text-white/60 text-xs mt-1">税号: {(company as any)?.taxId}</div>}
              {(company as any)?.contactName && <div className="text-white/60 text-xs">联系人: {(company as any)?.contactName} {(company as any)?.contactPhone}</div>}
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs">成员数</div>
              <div className="text-white text-2xl font-bold">{(company as any)?.memberCount || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 编辑公司信息弹窗 */}
      {isEditing && (
        <div className="mx-4 mt-3 rounded-xl border border-blue-100 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-blue-50" style={{ backgroundColor: '#F0F5FF' }}>
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4" style={{ color: '#1A56DB' }} />
              <span className="text-sm font-medium" style={{ color: '#1A56DB' }}>编辑公司信息</span>
            </div>
            <button onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">公司名称 *</label>
              <Input value={editName} onChange={(e: any) => setEditName(e.target.value)} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">联系人</label>
                <Input value={editContact} onChange={(e: any) => setEditContact(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">联系电话</label>
                <Input value={editPhone} onChange={(e: any) => setEditPhone(e.target.value)} className="text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">税号</label>
              <Input value={editTaxId} onChange={(e: any) => setEditTaxId(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">公司地址</label>
              <Input value={editAddress} onChange={(e: any) => setEditAddress(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">备注</label>
              <textarea
                value={editNote}
                onChange={(e: any) => setEditNote(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="text-white"
                style={{ backgroundColor: '#1A56DB' }}
                disabled={updateCompanyMutation.isPending || !editName.trim()}
                onClick={() => {
                  updateCompanyMutation.mutate({
                    ledgerId,
                    companyId,
                    name: editName.trim(),
                    contactName: editContact.trim() || undefined,
                    contactPhone: editPhone.trim() || undefined,
                    taxId: editTaxId.trim() || undefined,
                    address: editAddress.trim() || undefined,
                    note: editNote.trim() || undefined,
                  });
                }}
              >
                {updateCompanyMutation.isPending ? '保存中...' : '保存修改'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 切换栏 */}
      <div className="mx-4 -mt-3 rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="grid grid-cols-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex flex-col items-center py-3 transition-colors"
              style={{
                backgroundColor: activeTab === tab.key ? `${tab.color}10` : 'transparent',
                borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
              }}
            >
              <tab.icon className="w-5 h-5 mb-1" style={{ color: activeTab === tab.key ? tab.color : '#9CA3AF' }} />
              <span className="text-xs font-medium" style={{ color: activeTab === tab.key ? tab.color : '#9CA3AF' }}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容区域 */}
      <div className="px-4 py-4">
        {/* 人员管理 - 实际功能 */}
        {activeTab === 'members' && (
          <div>
            {/* 添加成员按钮 */}
            {isAdmin && (
              <button
                onClick={() => setShowAddMember(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-4 text-white font-medium"
                style={{ backgroundColor: '#7C3AED' }}
              >
                <UserPlus className="w-4 h-4" />
                添加成员到此公司
              </button>
            )}

            {/* 添加成员弹窗 */}
            {showAddMember && (
              <div className="rounded-xl border border-purple-100 mb-4 overflow-hidden" style={{ backgroundColor: '#FAF5FF' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                  <span className="text-sm font-medium" style={{ color: '#7C3AED' }}>选择要添加的成员</span>
                  <button onClick={() => { setShowAddMember(false); setSelectedUserId(null); }}>
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="p-4">
                  {/* 角色选择 */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setSelectedRole('client')}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: selectedRole === 'client' ? '#7C3AED' : '#F3F4F6',
                        color: selectedRole === 'client' ? '#FFFFFF' : '#6B7280',
                      }}
                    >
                      客户
                    </button>
                    <button
                      onClick={() => setSelectedRole('employee')}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: selectedRole === 'employee' ? '#7C3AED' : '#F3F4F6',
                        color: selectedRole === 'employee' ? '#FFFFFF' : '#6B7280',
                      }}
                    >
                      企业员工
                    </button>
                  </div>

                  {/* 可选成员列表 */}
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {availableMembers.length === 0 ? (
                      <div className="text-center text-gray-400 text-sm py-4">暂无可添加的成员</div>
                    ) : (
                      availableMembers.map((member: any) => (
                        <div
                          key={member.userId}
                          onClick={() => setSelectedUserId(member.userId)}
                          className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={{
                            backgroundColor: selectedUserId === member.userId ? '#EDE9FE' : '#FFFFFF',
                            border: selectedUserId === member.userId ? '1px solid #7C3AED' : '1px solid #E5E7EB',
                          }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ backgroundColor: '#7C3AED' }}>
                            {(member.nickname || member.userName || '?').charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{member.nickname || member.userName}</div>
                            <div className="text-xs text-gray-400">角色: {member.role === 'owner' ? '创建者' : member.role === 'admin' ? '管理员' : member.role === 'client' ? '客户' : member.role === 'employee' ? '企业员工' : '普通用户'}</div>
                          </div>
                          {selectedUserId === member.userId && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#7C3AED' }}>
                              <span className="text-white text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* 确认添加 */}
                  {selectedUserId && (
                    <button
                      onClick={() => {
                        addMemberMutation.mutate({
                          ledgerId,
                          companyId,
                          userId: selectedUserId,
                          role: selectedRole,
                        });
                      }}
                      disabled={addMemberMutation.isPending}
                      className="w-full mt-3 py-2.5 rounded-lg text-white text-sm font-medium"
                      style={{ backgroundColor: addMemberMutation.isPending ? '#A78BFA' : '#7C3AED' }}
                    >
                      {addMemberMutation.isPending ? '添加中...' : '确认添加'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 已绑定成员列表 */}
            <div className="space-y-3">
              {(companyMembers || []).length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: '#D1D5DB' }} />
                  <div className="text-gray-400 text-sm">暂无成员</div>
                  <div className="text-gray-300 text-xs mt-1">点击上方按钮添加成员到此公司</div>
                </div>
              ) : (
                (companyMembers as any[]).map((member: any) => (
                  <div key={member.id} className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: member.role === 'client' ? '#1A56DB' : '#059669' }}>
                      {(member.userName || '?').charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{member.userName}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: member.role === 'client' ? '#DBEAFE' : '#D1FAE5',
                            color: member.role === 'client' ? '#1A56DB' : '#059669',
                          }}>
                          {member.role === 'client' ? '客户' : '企业员工'}
                        </span>
                        <span className="text-xs text-gray-300">
                          {member.createdAt ? new Date(member.createdAt).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm('确定要移除该成员吗？')) {
                            removeMemberMutation.mutate({ ledgerId, memberId: member.id });
                          }
                        }}
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 报税 - 占位符 */}
        {activeTab === 'tax' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#DBEAFE' }}>
              <FileText className="w-8 h-8" style={{ color: '#1A56DB' }} />
            </div>
            <div className="text-gray-900 font-medium text-lg mb-2">报税管理</div>
            <div className="text-gray-400 text-sm mb-6">管理公司的税务申报、报税授权和税务日历</div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs" style={{ backgroundColor: '#EBF5FF', color: '#1A56DB' }}>
              <FileText className="w-3.5 h-3.5" />
              功能开发中，敬请期待
            </div>
          </div>
        )}

        {/* 社保 - 占位符 */}
        {activeTab === 'social' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
              <Shield className="w-8 h-8" style={{ color: '#059669' }} />
            </div>
            <div className="text-gray-900 font-medium text-lg mb-2">社保管理</div>
            <div className="text-gray-400 text-sm mb-6">管理公司员工的社保缴纳、公积金和社保变更</div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
              <Shield className="w-3.5 h-3.5" />
              功能开发中，敬请期待
            </div>
          </div>
        )}

        {/* 记账 - 占位符 */}
        {activeTab === 'accounting' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
              <Calculator className="w-8 h-8" style={{ color: '#D97706' }} />
            </div>
            <div className="text-gray-900 font-medium text-lg mb-2">记账管理</div>
            <div className="text-gray-400 text-sm mb-6">管理公司的日常记账、财务报表和凭证管理</div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
              <Calculator className="w-3.5 h-3.5" />
              功能开发中，敬请期待
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
