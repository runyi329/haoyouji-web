import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Building2, FileText, Shield, Calculator, Users, UserPlus, X, Trash2, Pencil, CalendarClock, CalendarDays, CheckCircle, FileCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ========== 中国法定节假日数据（2025-2026年） ==========
const CHINA_HOLIDAYS: Record<string, string> = {
  '2025-01-01': '元旦',
  '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节',
  '2025-02-01': '春节', '2025-02-02': '春节', '2025-02-03': '春节', '2025-02-04': '春节',
  '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
  '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节', '2025-05-04': '劳动节', '2025-05-05': '劳动节',
  '2025-05-31': '端午节', '2025-06-01': '端午节', '2025-06-02': '端午节',
  '2025-10-01': '国庆节', '2025-10-02': '国庆节', '2025-10-03': '国庆节', '2025-10-04': '国庆节',
  '2025-10-05': '国庆节', '2025-10-06': '国庆节', '2025-10-07': '国庆节', '2025-10-08': '国庆节',
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节', '2026-02-18': '春节',
  '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
  '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节', '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
  '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
  '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节', '2026-10-04': '国庆节',
  '2026-10-05': '国庆节', '2026-10-06': '国庆节', '2026-10-07': '国庆节',
};

const WORKDAY_OVERRIDES: Set<string> = new Set([
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
]);

function getBeijingNow(): { year: number; month: number; day: number; hour: number; date: Date } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  const hour = parseInt(get('hour'));
  const date = new Date(year, month - 1, day);
  return { year, month, day, hour, date };
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWorkday(d: Date): boolean {
  const key = formatDateKey(d);
  if (WORKDAY_OVERRIDES.has(key)) return true;
  if (CHINA_HOLIDAYS[key]) return false;
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return true;
}

const TAX_DEADLINES_2026: Record<number, number> = {
  1: 20, 2: 24, 3: 16, 4: 20, 5: 22, 6: 15,
  7: 15, 8: 17, 9: 15, 10: 26, 11: 16, 12: 15,
};

function getTaxDeadline(year: number, month: number): { deadline: Date; originalDate: Date; postponed: boolean; reason: string } {
  const original = new Date(year, month - 1, 15);
  if (year === 2026 && TAX_DEADLINES_2026[month]) {
    const actualDay = TAX_DEADLINES_2026[month];
    const deadline = new Date(year, month - 1, actualDay);
    const postponed = actualDay !== 15;
    let reason = '';
    if (postponed) {
      const reasons: string[] = [];
      let d = new Date(original);
      while (d < deadline) {
        const key = formatDateKey(d);
        const holidayName = CHINA_HOLIDAYS[key];
        const dow = d.getDay();
        if (holidayName && !reasons.includes(holidayName)) {
          reasons.push(holidayName);
        } else if (dow === 0 && !holidayName) {
          if (!reasons.includes('周日')) reasons.push('周日');
        } else if (dow === 6 && !holidayName) {
          if (!reasons.includes('周六')) reasons.push('周六');
        }
        d = new Date(d.getTime() + 86400000);
      }
      reason = `因${reasons.join('、')}顺延至${month}月${actualDay}日`;
    }
    return { deadline, originalDate: original, postponed, reason };
  }
  let current = new Date(original);
  const reasons: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (isWorkday(current)) break;
    const key = formatDateKey(current);
    const holidayName = CHINA_HOLIDAYS[key];
    const dow = current.getDay();
    if (holidayName && !reasons.includes(holidayName)) {
      reasons.push(holidayName);
    } else if (dow === 0 && !holidayName) {
      if (!reasons.includes('周日')) reasons.push('周日');
    } else if (dow === 6 && !holidayName) {
      if (!reasons.includes('周六')) reasons.push('周六');
    }
    current = new Date(current.getTime() + 86400000);
  }
  const postponed = current.getTime() !== original.getTime();
  const reasonText = postponed
    ? `因${reasons.join('、')}顺延至${current.getMonth() + 1}月${current.getDate()}日`
    : '';
  return { deadline: current, originalDate: original, postponed, reason: reasonText };
}

function getNextTaxDeadlineInfo(): { deadline: Date; originalDate: Date; postponed: boolean; reason: string; taxMonth: number; taxYear: number; daysLeft: number } {
  const bj = getBeijingNow();
  const currentYear = bj.year;
  const currentMonth = bj.month;
  const todayDate = bj.date;
  const currentDeadline = getTaxDeadline(currentYear, currentMonth);
  const deadlineDate = new Date(currentDeadline.deadline.getFullYear(), currentDeadline.deadline.getMonth(), currentDeadline.deadline.getDate());
  if (todayDate <= deadlineDate) {
    const diffMs = deadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    const taxMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const taxYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    return { ...currentDeadline, taxMonth, taxYear, daysLeft };
  } else {
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextDeadline = getTaxDeadline(nextYear, nextMonth);
    const nextDeadlineDate = new Date(nextDeadline.deadline.getFullYear(), nextDeadline.deadline.getMonth(), nextDeadline.deadline.getDate());
    const diffMs = nextDeadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return { ...nextDeadline, taxMonth: currentMonth, taxYear: currentYear, daysLeft };
  }
}

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

  // 报税日历弹出框状态
  const [showTaxCalendar, setShowTaxCalendar] = useState(false);
  const [taxCalendarYear, setTaxCalendarYear] = useState(() => new Date().getFullYear());

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
  const isClient = userRole === 'client';
  const isEmployee = userRole === 'employee';

  // 获取报税授权记录（仅该公司）
  const { data: taxAuthsData, refetch: refetchTaxAuths } = trpc.ledger.ahGetTaxAuthorizations.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const companyTaxAuths = (taxAuthsData as any[] || []).filter((a: any) => a.companyId === companyId);
  const latestAuth = companyTaxAuths.length > 0 ? companyTaxAuths[0] : null;

  // 报税截止日信息
  const taxInfo = getNextTaxDeadlineInfo();
  const { deadline: nextDue, daysLeft, postponed: isPostponed, reason: postponeReason, taxMonth: reportTaxMonth, taxYear: reportTaxYear } = taxInfo;
  const statusColor = latestAuth?.status === 'authorized' ? '#10B981' : latestAuth?.status === 'filed' ? '#6B7280' : latestAuth?.status === 'expired' ? '#EF4444' : '#F59E0B';
  const statusText = latestAuth?.status === 'authorized' ? '客户已授权，可申报扣税' : latestAuth?.status === 'filed' ? '已申报' : latestAuth?.status === 'expired' ? '已过期' : '待客户授权';

  // 客户确认授权
  const authorizeMutation = trpc.ledger.ahAuthorize.useMutation({
    onSuccess: () => {
      toast.success('授权成功');
      refetchTaxAuths();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // 管理员标记已申报
  const markFiledMutation = trpc.ledger.ahMarkFiled.useMutation({
    onSuccess: () => {
      toast.success('已标记为申报完成');
      refetchTaxAuths();
    },
    onError: (err: any) => toast.error(err.message),
  });

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

  const bjNow = getBeijingNow();

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
        {/* 人员管理 */}
        {activeTab === 'members' && (
          <div>
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

            {showAddMember && isAdmin && (
              <div className="mb-4 rounded-xl border border-purple-100 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-50" style={{ backgroundColor: '#F5F3FF' }}>
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" style={{ color: '#7C3AED' }} />
                    <span className="text-sm font-medium" style={{ color: '#7C3AED' }}>添加成员</span>
                  </div>
                  <button onClick={() => { setShowAddMember(false); setSelectedUserId(null); }}>
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="p-4">
                  {/* 角色选择 */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setSelectedRole('client')}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                      style={{
                        backgroundColor: selectedRole === 'client' ? '#EDE9FE' : 'transparent',
                        borderColor: selectedRole === 'client' ? '#7C3AED' : '#E5E7EB',
                        color: selectedRole === 'client' ? '#7C3AED' : '#6B7280',
                      }}
                    >
                      客户
                    </button>
                    <button
                      onClick={() => setSelectedRole('employee')}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                      style={{
                        backgroundColor: selectedRole === 'employee' ? '#D1FAE5' : 'transparent',
                        borderColor: selectedRole === 'employee' ? '#059669' : '#E5E7EB',
                        color: selectedRole === 'employee' ? '#059669' : '#6B7280',
                      }}
                    >
                      企业员工
                    </button>
                  </div>

                  {/* 成员选择列表 */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableMembers.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">暂无可添加的成员</div>
                    ) : (
                      availableMembers.map((m: any) => (
                        <button
                          key={m.userId}
                          onClick={() => setSelectedUserId(m.userId)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                          style={{
                            backgroundColor: selectedUserId === m.userId ? '#EDE9FE' : '#F9FAFB',
                            borderColor: selectedUserId === m.userId ? '#7C3AED' : '#E5E7EB',
                          }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ backgroundColor: '#7C3AED' }}>
                            {(m.userName || '?').charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{m.userName}</div>
                            <div className="text-xs text-gray-400">{m.role}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

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

        {/* 报税 - 完整功能 */}
        {activeTab === 'tax' && (
          <div className="space-y-4">
            {/* 当前报税周期信息卡 */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" style={{ color: '#1A56DB' }} />
                  <span className="text-sm font-medium text-gray-800">报税授权</span>
                  {latestAuth && <span className="text-xs text-gray-400">{latestAuth.taxPeriod}期</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                  <span className="text-xs font-medium" style={{ color: statusColor }}>{statusText}</span>
                </div>
              </div>

              {/* 截止日倒计时 */}
              <div className="p-4">
                <div className="rounded-xl p-3" style={{ backgroundColor: daysLeft <= 3 ? '#FEF2F2' : daysLeft <= 7 ? '#FFFBEB' : '#EFF6FF' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 mb-1">
                        申报{reportTaxYear}年{reportTaxMonth}月税务 · 截止日
                      </div>
                      <div className="text-sm font-semibold" style={{ color: '#1E3A8A' }}>
                        {nextDue.getMonth() + 1}月{nextDue.getDate()}日（{['周日','周一','周二','周三','周四','周五','周六'][nextDue.getDay()]}）
                      </div>
                      {isPostponed && (
                        <div className="text-xs mt-1" style={{ color: '#F59E0B' }}>
                          ⚠️ 原截止日{nextDue.getMonth() + 1}月15日，{postponeReason}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* 日历按钮 */}
                      <button
                        onClick={() => {
                          setShowTaxCalendar(!showTaxCalendar);
                          setTaxCalendarYear(nextDue.getFullYear());
                        }}
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: showTaxCalendar ? '#DBEAFE' : '#F3F4F6' }}
                      >
                        <CalendarDays className="w-5 h-5" style={{ color: '#1A56DB' }} />
                      </button>
                      <div className="flex flex-col items-center min-w-[44px]">
                        <span className="text-3xl font-bold leading-none" style={{ color: daysLeft <= 3 ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#1A56DB' }}>{daysLeft}</span>
                        <span className="text-xs text-gray-500 mt-0.5">天</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 操作按钮区 */}
                <div className="mt-3 flex gap-2">
                  {/* 客户角色：确认授权按钮 */}
                  {isClient && latestAuth?.status === 'pending' && (
                    <Button
                      size="sm"
                      className="flex-1 text-white"
                      style={{ backgroundColor: '#10B981' }}
                      disabled={authorizeMutation.isPending}
                      onClick={() => authorizeMutation.mutate({ ledgerId, authId: latestAuth.id })}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      {authorizeMutation.isPending ? '授权中...' : '确认授权报税'}
                    </Button>
                  )}
                  {isClient && latestAuth?.status === 'authorized' && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#ECFDF5', color: '#10B981' }}>
                      <CheckCircle className="w-4 h-4" />已授权，等待申报
                    </div>
                  )}
                  {isClient && latestAuth?.status === 'filed' && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                      <FileCheck className="w-4 h-4" />本期已申报完成
                    </div>
                  )}
                  {/* 管理员角色：标记已申报按钮 */}
                  {isAdmin && latestAuth?.status === 'authorized' && (
                    <Button
                      size="sm"
                      className="flex-1 text-white"
                      style={{ backgroundColor: '#1A56DB' }}
                      disabled={markFiledMutation.isPending}
                      onClick={() => markFiledMutation.mutate({ ledgerId, authId: latestAuth.id })}
                    >
                      <FileCheck className="w-4 h-4 mr-1.5" />
                      {markFiledMutation.isPending ? '处理中...' : '标记已申报'}
                    </Button>
                  )}
                  {isAdmin && latestAuth?.status === 'pending' && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#FFF7ED', color: '#F59E0B' }}>
                      <AlertCircle className="w-4 h-4" />等待客户授权中
                    </div>
                  )}
                  {isAdmin && latestAuth?.status === 'filed' && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                      <FileCheck className="w-4 h-4" />本期已申报
                    </div>
                  )}
                  {!latestAuth && isAdmin && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#F3F4F6', color: '#9CA3AF' }}>
                      暂无报税授权记录
                    </div>
                  )}
                  {!latestAuth && !isAdmin && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#F3F4F6', color: '#9CA3AF' }}>
                      暂无授权记录
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 全年报税截止日日历 */}
            {showTaxCalendar && (
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {/* 头部：年份切换 */}
                <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#F0F5FF' }}>
                  <button
                    onClick={() => setTaxCalendarYear(y => y - 1)}
                    className="p-1.5 rounded-lg hover:bg-blue-100"
                  >
                    <ChevronLeft className="w-4 h-4" style={{ color: '#1A56DB' }} />
                  </button>
                  <span className="text-sm font-semibold" style={{ color: '#1A56DB' }}>{taxCalendarYear}年 报税截止日一览</span>
                  <button
                    onClick={() => setTaxCalendarYear(y => y + 1)}
                    className="p-1.5 rounded-lg hover:bg-blue-100"
                  >
                    <ChevronRight className="w-4 h-4" style={{ color: '#1A56DB' }} />
                  </button>
                </div>

                {/* 12个月截止日标签 */}
                <div className="grid grid-cols-3 gap-2 p-4">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const monthTaxInfo = getTaxDeadline(taxCalendarYear, m);
                    const deadlineDay = monthTaxInfo.deadline.getDate();
                    const isPostponedMonth = monthTaxInfo.postponed;
                    const now = new Date();
                    const isPast = taxCalendarYear < bjNow.year || (taxCalendarYear === bjNow.year && m < bjNow.month);
                    const isCurrent = taxCalendarYear === bjNow.year && m === bjNow.month;
                    const isDeadlinePast = now > monthTaxInfo.deadline;

                    let bgColor = '#F9FAFB';
                    let borderColor = '#E5E7EB';
                    let textColor = '#374151';
                    let dateColor = '#1A56DB';

                    if (isCurrent && !isDeadlinePast) {
                      bgColor = '#EFF6FF';
                      borderColor = '#1A56DB';
                      dateColor = '#1A56DB';
                    } else if (isPast || isDeadlinePast) {
                      textColor = '#9CA3AF';
                      dateColor = '#9CA3AF';
                    }

                    return (
                      <div
                        key={m}
                        className="rounded-lg px-3 py-2.5 border"
                        style={{ backgroundColor: bgColor, borderColor }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: textColor }}>{m}月</span>
                          <span className="text-sm font-bold" style={{ color: dateColor }}>{deadlineDay}日</span>
                        </div>
                        {isPostponedMonth ? (
                          <div className="text-xs mt-0.5" style={{ color: '#F59E0B' }}>原15日顺延</div>
                        ) : (
                          <div className="text-xs mt-0.5" style={{ color: isPast || isDeadlinePast ? '#D1D5DB' : '#10B981' }}>未顺延</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 图例 */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100" style={{ backgroundColor: '#FAFAFA' }}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EFF6FF', border: '1px solid #1A56DB' }} />
                    <span className="text-xs text-gray-500">当月</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: '#F59E0B' }}>原15日顺延</span>
                    <span className="text-xs text-gray-400">= 有顺延</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: '#10B981' }}>未顺延</span>
                    <span className="text-xs text-gray-400">= 即15日</span>
                  </div>
                </div>
              </div>
            )}

            {/* 历史授权记录 */}
            {companyTaxAuths.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-medium text-gray-800">历史授权记录</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {companyTaxAuths.map((auth: any) => {
                    const authStatusColor = auth.status === 'authorized' ? '#10B981' : auth.status === 'filed' ? '#6B7280' : auth.status === 'expired' ? '#EF4444' : '#F59E0B';
                    const authStatusText = auth.status === 'authorized' ? '已授权' : auth.status === 'filed' ? '已申报' : auth.status === 'expired' ? '已过期' : '待授权';
                    return (
                      <div key={auth.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="text-sm text-gray-800">{auth.taxPeriod}期</div>
                          {auth.authorizedAt && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              授权时间: {new Date(auth.authorizedAt).toLocaleDateString('zh-CN')}
                            </div>
                          )}
                          {auth.filedAt && (
                            <div className="text-xs text-gray-400">
                              申报时间: {new Date(auth.filedAt).toLocaleDateString('zh-CN')}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: authStatusColor }} />
                          <span className="text-xs font-medium" style={{ color: authStatusColor }}>{authStatusText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
