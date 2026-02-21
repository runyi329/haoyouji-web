import { useLocation, useParams } from 'wouter';
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus } from 'lucide-react';
import AddMemberDialog from '../components/AddMemberDialog';

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
    // API返回的是对象 {id, name}
    if (typeof group === 'object' && group !== null) {
      return (
        <span 
          key={group.id || index}
          className="px-1.5 py-0.5 text-xs bg-[#FFEBEE] text-[#D32F2F] rounded"
        >
          {group.name}
        </span>
      );
    }
    // 模拟数据是数字
    return (
      <span 
        key={index}
        className="px-1.5 py-0.5 text-xs bg-[#FFEBEE] text-[#D32F2F] rounded"
      >
        群{group}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
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
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
          {members.length === 0 ? (
            <div className="text-center text-[#757575] py-8">
              暂无成员，点击右上角 + 添加
            </div>
          ) : (
            members.map((member: any) => (
              <div
                key={member.id}
                onClick={() => setLocation(`/work-group-member/${member.id}`)}
                className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {/* 头像 */}
                  <img
                    src={member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`}
                    alt={member.name}
                    className="w-12 h-12 rounded-full border-2 border-[#D32F2F]/10"
                  />

                  {/* 信息区域 */}
                  <div className="flex-1">
                    {/* 第一行：用户名、工作群标签和加入时间 */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#222222]">{member.name}</span>
                        {/* 工作群标签 */}
                        <div className="flex gap-1">
                          {member.workGroups?.map((group: any, index: number) => 
                            renderWorkGroupBadge(group, index)
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-[#757575]">
                        加入 {member.joinedAt ? member.joinedAt.split(' ')[0] : ''}
                      </span>
                    </div>

                    {/* 第二行：角色信息 */}
                    <div className="text-xs text-[#757575]">
                      {member.role === 'admin' ? '管理员' : '成员'}
                      {member.email && ` · ${member.email}`}
                    </div>
                  </div>

                  {/* 右箭头 */}
                  <svg className="w-5 h-5 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))
          )}
        </div>
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
