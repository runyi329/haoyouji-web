import { useLocation, useParams } from 'wouter';
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus, Users } from 'lucide-react';
import AddMemberDialog from '../components/AddMemberDialog';

// 6个成长里程碑
const MILESTONES = [
  { id: 'profile',    short: '资料',   full: '添加资料' },
  { id: 'contact',   short: '人脉',   full: '添加人脉' },
  { id: 'share',     short: '共享人脉', full: '共享人脉' },
  { id: 'ledger',    short: '账本',   full: '添加账本' },
  { id: 'sharebook', short: '共享账本', full: '共享账本' },
  { id: 'invite',    short: '邀请',   full: '邀请好友' },
];

function inferCompleted(member: any): Set<string> {
  const done = new Set<string>();
  if (member.avatar || member.email) done.add('profile');
  if ((member.ownContactsCount || 0) > 0) done.add('contact');
  if ((member.sharedContactsCount || 0) > 0 || (member.interactionsCount || 0) > 0 || (member.tagsCount || 0) > 0) done.add('share');
  if ((member.ledgerCount || 0) > 0) done.add('ledger');
  if ((member.recordCount || 0) > 0 || (member.ledgerCount || 0) > 1) done.add('sharebook');
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
            const done = inferCompleted(member);
            const completedCount = done.size;
            // 找到最后一个已完成的索引，用于轨道着色
            const lastDoneIdx = MILESTONES.reduce((acc, m, i) => done.has(m.id) ? i : acc, -1);

            return (
              <div
                key={member.id}
                onClick={() => setLocation(`/work-group-member/${member.id}`)}
                className="bg-white rounded-xl shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
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

                  {/* 第二行：横向任务轴 */}
                  {/* 设计：轨道线贯穿，节点用菱形/圆形区分完成状态，标签在下方 */}
                  <div className="relative flex items-start">
                    {/* 底层轨道线 */}
                    <div
                      className="absolute"
                      style={{
                        top: '7px',
                        left: '7px',
                        right: '7px',
                        height: '2px',
                        backgroundColor: '#EEEEEE',
                        zIndex: 0,
                      }}
                    />
                    {/* 已完成段的轨道线（覆盖在灰色上） */}
                    {lastDoneIdx >= 0 && (
                      <div
                        className="absolute"
                        style={{
                          top: '7px',
                          left: '7px',
                          // 每段宽度 = (100% - 14px) / 5 * lastDoneIdx
                          width: `calc((100% - 14px) / 5 * ${lastDoneIdx})`,
                          height: '2px',
                          backgroundColor: 'var(--brand-red)',
                          zIndex: 1,
                        }}
                      />
                    )}

                    {/* 节点列表 */}
                    {MILESTONES.map((m, idx) => {
                      const isDone = done.has(m.id);
                      const isActive = idx === lastDoneIdx + 1; // 下一个待完成
                      return (
                        <div
                          key={m.id}
                          className="flex flex-col items-center flex-1"
                          style={{ position: 'relative', zIndex: 2 }}
                        >
                          {/* 节点圆 */}
                          <div
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              backgroundColor: isDone ? 'var(--brand-red)' : isActive ? 'white' : 'white',
                              border: isDone
                                ? '2px solid var(--brand-red)'
                                : isActive
                                ? '2px solid var(--brand-red)'
                                : '2px solid #DDDDDD',
                              boxShadow: isDone ? '0 0 0 2px rgba(211,47,47,0.15)' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isDone && (
                              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                                <path d="M1 3.5L2.8 5.5L6 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isActive && (
                              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--brand-red)' }} />
                            )}
                          </div>

                          {/* 标签 */}
                          <span
                            style={{
                              fontSize: '9px',
                              lineHeight: '1.2',
                              marginTop: '3px',
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              color: isDone ? 'var(--brand-red)' : isActive ? '#555555' : '#CCCCCC',
                              fontWeight: isDone || isActive ? 500 : 400,
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
