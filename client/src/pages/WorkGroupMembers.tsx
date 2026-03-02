import { useLocation, useParams } from 'wouter';
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus, Users } from 'lucide-react';
import AddMemberDialog from '../components/AddMemberDialog';
import { Card, CardContent } from "@/components/ui/card";

// 5个成长动作定义
const GROWTH_ACTIONS = [
  { id: 'profile',   label: '资料' },      // 头像+邮箱+银行卡+支付宝+微信+数字钱包
  { id: 'share',     label: '共享人脉' },  // 人脉+联络+标签+推荐人
  { id: 'sharebook', label: '共享账本' },  // 账本+账目+加入账本+共享账本
  { id: 'invite',    label: '邀请好友' },
];

/**
 * 根据成员数据推断哪些动作已完成
 * 实际项目中应由后端返回 completedActions 字段
 */
function inferCompletedActions(member: any): Set<string> {
  const done = new Set<string>();
  // 「资料」：有头像或邮箱即视为已完成
  if (member.avatar || member.email) done.add('profile');
  // 共享人脉：有人脉、联络、标签任意一项即视为已完成
  if ((member.ownContactsCount || 0) > 0 || (member.interactionsCount || 0) > 0 || (member.tagsCount || 0) > 0 || (member.sharedContactsCount || 0) > 0) done.add('share');
  // 共享账本：有账本或账目即视为已完成
  if ((member.ledgerCount || 0) > 0 || (member.recordCount || 0) > 0) done.add('sharebook');
  return done;
}

export default function WorkGroupMembers() {
  const [, setLocation] = useLocation();
  const { groupId } = useParams();
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  
  // 获取当前用户信息
  const { data: currentUser } = trpc.auth.me.useQuery();

  // 固定的有限合伙企业ID（目前只有一个企业）
  const partnershipId = 1;

  // 获取成员列表
  const { data: members = [], refetch: refetchMembers } = trpc.partnership.getMembers.useQuery(
    { partnershipId },
    { enabled: true }
  );

  // 处理添加成员成功
  const handleAddMemberSuccess = () => {
    refetchMembers();
  };

  // 渲染工作群标签 - 兼容对象格式和数字格式
  const renderWorkGroupBadge = (group: any, index: number) => {
    if (typeof group === 'object' && group !== null) {
      return (
        <span 
          key={group.id || index}
          className="px-1.5 py-0.5 text-xs rounded"
          style={{ 
            backgroundColor: 'var(--brand-red-light)', 
            color: 'var(--brand-red)' 
          }}
        >
          {group.name}
        </span>
      );
    }
    return (
      <span 
        key={index}
        className="px-1.5 py-0.5 text-xs rounded"
        style={{ 
          backgroundColor: 'var(--brand-red-light)', 
          color: 'var(--brand-red)' 
        }}
      >
        群{group}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div 
        className="text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10"
        style={{ backgroundColor: 'var(--brand-red)' }}
      >
        <button 
          onClick={() => setLocation('/work-groups')}
          className="p-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">上海煦斌教育科技合伙企业</h1>
        {/* 添加成员按钮（仅管理员可见） */}
        {currentUser?.role === 'super_admin' && (
          <button
            onClick={() => setIsAddMemberDialogOpen(true)}
            className="p-1"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
        {currentUser?.role !== 'super_admin' && <div className="w-6"></div>}
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {members.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Users className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-gray)' }} />
              <p className="text-sm" style={{ color: 'var(--text-gray)' }}>暂无成员</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>点击右上角 + 添加</p>
            </CardContent>
          </Card>
        ) : (
          members.map((member: any) => {
                    const completedActions = inferCompletedActions(member);
            const completedCount = completedActions.size;
            const totalCount = 4;

            return (
              <Card 
                key={member.id}
                onClick={() => setLocation(`/work-group-member/${member.id}`)}
                className="bg-white/90 backdrop-blur-sm cursor-pointer hover:shadow-md transition-shadow"
              >
                <CardContent className="p-3">
                  {/* 第一行：头像 + 基本信息 */}
                  <div className="flex items-center gap-2.5 mb-2.5">
                    {/* 头像 */}
                    <div className="flex-shrink-0">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-11 h-11 rounded-full object-cover border-2"
                          style={{ borderColor: 'color-mix(in srgb, var(--brand-red) 10%, transparent)' }}
                        />
                      ) : (
                        <div 
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{ 
                            background: 'linear-gradient(135deg, var(--brand-red-dark) 0%, var(--brand-red) 100%)' 
                          }}
                        >
                          {(member.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 基本信息 */}
                    <div className="flex-1 min-w-0">
                      {/* 姓名和工作群标签 */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 
                          className="font-semibold text-[15px]"
                          style={{ color: 'var(--text-black)' }}
                        >
                          {member.name}
                        </h3>
                        {member.workGroups && member.workGroups.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {member.workGroups.map((group: any, index: number) => 
                              renderWorkGroupBadge(group, index)
                            )}
                          </div>
                        )}
                      </div>

                      {/* 加入时间 */}
                      <div 
                        className="text-[11px] flex items-center gap-1.5"
                        style={{ color: 'var(--text-gray)' }}
                      >
                        <span className="flex-shrink-0">
                          {member.joinedAt ? member.joinedAt.split(' ')[0] : ''}
                        </span>
                      </div>
                    </div>

                    {/* 右侧完成进度 */}
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs font-bold" style={{ color: 'var(--brand-red)' }}>
                        {completedCount}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-gray)' }}>
                        /4
                      </span>
                    </div>
                  </div>

                  {/* 成长动作流程链（单行，4个节点） */}
                  <div className="flex items-center w-full overflow-hidden">
                    {GROWTH_ACTIONS.map((action, idx) => {
                      const done = completedActions.has(action.id);
                      const isLast = idx === GROWTH_ACTIONS.length - 1;
                      return (
                        <div key={action.id} className="flex items-center flex-1 min-w-0">
                          {/* 节点 */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: done ? '#4CAF50' : '#EF5350' }}
                              title={action.label}
                            />
                            <span 
                              className="text-[8px] leading-tight mt-0.5 text-center whitespace-nowrap"
                              style={{ color: done ? '#4CAF50' : '#BDBDBD' }}
                            >
                              {action.label}
                            </span>
                          </div>
                          {/* 连接线（最后一个不加） */}
                          {!isLast && (
                            <div 
                              className="flex-1 h-px mx-0.5"
                              style={{ backgroundColor: done ? '#4CAF50' : '#E0E0E0', minWidth: '4px' }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* 添加成员对话框 */}
      <AddMemberDialog
        isOpen={isAddMemberDialogOpen}
        onClose={() => setIsAddMemberDialogOpen(false)}
        onSuccess={handleAddMemberSuccess}
        partnershipId={partnershipId}
      />
    </div>
  );
}
