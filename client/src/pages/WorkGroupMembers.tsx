import { useLocation, useParams } from 'wouter';
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus, Users } from 'lucide-react';
import AddMemberDialog from '../components/AddMemberDialog';

// 6个成长里程碑
const MILESTONES = [
  { id: 'profile',    short: '个人资料' },
  { id: 'contact',   short: '新建人脉' },
  { id: 'share',     short: '共享人脉' },
  { id: 'ledger',    short: '新建账本' },
  { id: 'sharebook', short: '共享账本' },
  { id: 'invite',    short: '好友邀请' },
];

function inferCompleted(member: any): Set<string> {
  const done = new Set<string>();
  // 直接使用后端返回的真实字段
  if (member.hasProfile)      done.add('profile');
  if (member.hasContact)      done.add('contact');
  if (member.hasShareContact) done.add('share');
  if (member.hasLedger)       done.add('ledger');
  if (member.hasShareBook)    done.add('sharebook');
  if (member.hasInvite)       done.add('invite');
  return done;
}

export default function WorkGroupMembers() {
  const [, setLocation] = useLocation();
  const { groupId } = useParams();
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);

  const { data: currentUser } = trpc.auth.me.useQuery();
  const partnershipId = 1;
  const { data: members = [], refetch: refetchMembers } = trpc.partnership.getMembers.useQuery(
    { partnershipId },
    { enabled: true }
  );

  const renderWorkGroupBadge = (group: any, index: number) => {
    const name = typeof group === 'object' && group !== null ? group.name : `群${group}`;
    return (
      <span
        key={group?.id || index}
        className="px-1.5 py-0.5 text-[10px] rounded-sm font-medium"
        style={{ backgroundColor: 'var(--brand-red-light)', color: 'var(--brand-red)' }}
      >
        {name}
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>
      {/* 顶部导航 */}
      <div
        className="text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10"
        style={{ backgroundColor: 'var(--brand-red)' }}
      >
        <button onClick={() => setLocation('/work-groups')} className="p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">上海煦斌教育科技合伙企业</h1>
        {currentUser?.role === 'super_admin' ? (
          <button onClick={() => setIsAddMemberDialogOpen(true)} className="p-1">
            <Plus className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {members.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <Users className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-gray)' }} />
            <p className="text-sm" style={{ color: 'var(--text-gray)' }}>暂无成员</p>
          </div>
        ) : (
          members.map((member: any) => {
            const completedActions = inferCompleted(member);
            const completedCount = completedActions.size;
            // 找到最后一个已完成的索引，用于轨道着色
            const lastDoneIdx = MILESTONES.reduce((acc, m, i) => completedActions.has(m.id) ? i : acc, -1);
            // 只有超级管理员或本人可以点入详情
            const isSuperAdmin = currentUser?.role === 'super_admin';
            const isSelf = currentUser?.id === member.id;
            const canClick = isSuperAdmin || isSelf;

            return (
              <div
                key={member.id}
                onClick={() => canClick && setLocation(`/work-group-member/${member.id}`)}
                className={`bg-white rounded-xl shadow-sm transition-transform ${
                  canClick ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
                }`}
                style={{ overflow: 'hidden' }}
              >
                {/* 顶部红色进度条 */}
                <div className="h-0.5 w-full bg-gray-100">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(completedCount / MILESTONES.length) * 100}%`,
                      backgroundColor: 'var(--brand-red)',
                    }}
                  />
                </div>

                <div className="px-3 pt-2.5 pb-3">
                  {/* 第一行：头像 + 姓名 + 进度数字 */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {/* 头像 */}
                    <div className="flex-shrink-0">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-10 h-10 rounded-full object-cover"
                          style={{ border: '2px solid #F5F5F5' }}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{ background: 'linear-gradient(135deg, #C62828 0%, var(--brand-red) 100%)' }}
                        >
                          {(member.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 姓名 + 工作群 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[15px]" style={{ color: '#1A1A1A' }}>
                          {member.name}
                        </span>
                        {member.workGroups?.map((g: any, i: number) => renderWorkGroupBadge(g, i))}
                      </div>
                      <span className="text-[10px]" style={{ color: '#BDBDBD' }}>
                        {member.joinedAt ? member.joinedAt.split(' ')[0] : ''}
                      </span>
                    </div>

                    {/* 进度数字 */}
                    <div className="flex-shrink-0 flex items-baseline gap-0.5">
                      <span className="text-sm font-bold" style={{ color: 'var(--brand-red)' }}>
                        {completedCount}
                      </span>
                      <span className="text-[10px]" style={{ color: '#BDBDBD' }}>
                        /{MILESTONES.length}
                      </span>
                    </div>
                  </div>

                  {/* 横向任务轴 */}
                  <div className="relative flex items-start">
                    {/* 轨道线：从第1个节点中心到最后一个节点中心 */}
                    {/* 每个节点占 flex-1，节点宽6px，所以轨道从左偶 3px 到右偶 3px */}
                    <div
                      className="absolute"
                      style={{
                        top: '5px',
                        left: 'calc(100% / 12)',       // 第一个节点中心
                        right: 'calc(100% / 12)',      // 最后一个节点中心
                        height: '1px',
                        backgroundColor: '#E0E0E0',
                        zIndex: 0,
                      }}
                    />
                    {/* 已完成段红色轨道 */}
                    {lastDoneIdx >= 0 && (
                      <div
                        className="absolute"
                        style={{
                          top: '5px',
                          left: 'calc(100% / 12)',
                          width: `calc((100% - 100% / 6) / 5 * ${lastDoneIdx})`,
                          height: '1px',
                          backgroundColor: 'var(--brand-red)',
                          zIndex: 1,
                        }}
                      />
                    )}

                    {/* 节点列表 */}
                    {MILESTONES.map((m) => {
                      const isDone = done.has(m.id);
                      return (
                        <div
                          key={m.id}
                          className="flex flex-col items-center flex-1"
                          style={{ position: 'relative', zIndex: 2 }}
                        >
                          {/* 节点圆 */}
                          <div
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: isDone ? 'var(--brand-red)' : 'white',
                              border: isDone ? '1.5px solid var(--brand-red)' : '1.5px solid #CCCCCC',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isDone && (
                              <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                                <path d="M1 3L2.5 4.5L5 1.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>

                          {/* 标签 */}
                          <span
                            style={{
                              fontSize: '8.5px',
                              lineHeight: '1.2',
                              marginTop: '3px',
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              color: isDone ? 'var(--brand-red)' : '#C0C0C0',
                              fontWeight: isDone ? 500 : 400,
                            }}
                          >
                            {m.short}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AddMemberDialog
        isOpen={isAddMemberDialogOpen}
        onClose={() => setIsAddMemberDialogOpen(false)}
        onSuccess={() => refetchMembers()}
        partnershipId={partnershipId}
      />
    </div>
  );
}
