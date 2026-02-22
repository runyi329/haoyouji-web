import { useLocation, useParams } from 'wouter';
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus, Users, Share } from 'lucide-react';
import AddMemberDialog from '../components/AddMemberDialog';
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 flex flex-col">
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
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {members.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Users className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 text-sm">暂无成员</p>
              <p className="text-xs text-gray-400 mt-1">点击右上角 + 添加</p>
            </CardContent>
          </Card>
        ) : (
          members.map((member: any) => (
            <Card 
              key={member.id}
              onClick={() => setLocation(`/work-group-member/${member.id}`)}
              className="bg-white/80 backdrop-blur-sm cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-3">
                {/* 第一行：头像 + 基本信息（紧凑布局） */}
                <div className="flex items-center gap-2.5 mb-2">
                  {/* 头像 */}
                  <div className="flex-shrink-0">
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-[#D32F2F]/10"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center text-white font-bold text-sm">
                        {(member.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* 基本信息 */}
                  <div className="flex-1 min-w-0">
                    {/* 姓名和工作群标签 */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-semibold text-[15px] text-[#222222]">{member.name}</h3>
                      {/* 工作群标签 */}
                      {member.workGroups && member.workGroups.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {member.workGroups.map((group: any, index: number) => 
                            renderWorkGroupBadge(group, index)
                          )}
                        </div>
                      )}
                    </div>

                    {/* 角色、邮箱、加入时间（一行显示） */}
                    <div className="text-[11px] text-[#757575] flex items-center gap-1.5">
                      <span>{member.role === 'admin' ? '管理员' : '成员'}</span>
                      {member.email && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[120px]">{member.email}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="flex-shrink-0">
                        {member.joinedAt ? member.joinedAt.split(' ')[0] : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 第二行：统计数据（紧凑的横向布局，5个徽章） */}
                <div className="grid grid-cols-5 gap-1.5">
                  {/* 我的 */}
                  <div className="flex flex-col items-center px-1.5 py-1 rounded bg-[#F5F5F5]">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <Users className="w-3 h-3 text-[#1976D2]" />
                      <span className="text-[10px] text-[#757575]">我的</span>
                    </div>
                    <span className="text-sm text-[#1976D2] font-semibold leading-none">
                      {member.ownContactsCount || 0}
                    </span>
                  </div>

                  {/* 共享 */}
                  <div className="flex flex-col items-center px-1.5 py-1 rounded bg-[#E8F5E9]">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <Share className="w-3 h-3 text-[#4CAF50]" />
                      <span className="text-[10px] text-[#757575]">共享</span>
                    </div>
                    <span className="text-sm text-[#4CAF50] font-semibold leading-none">
                      {member.sharedContactsCount || 0}
                    </span>
                  </div>

                  {/* 全部 */}
                  <div className="flex flex-col items-center px-1.5 py-1 rounded bg-[#FFEBEE]">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <Users className="w-3 h-3 text-[#D32F2F]" />
                      <span className="text-[10px] text-[#757575]">全部</span>
                    </div>
                    <span className="text-sm text-[#D32F2F] font-semibold leading-none">
                      {member.totalContactsCount || 0}
                    </span>
                  </div>
                  
                  {/* 标签数 */}
                  <div className="flex flex-col items-center px-1.5 py-1 rounded bg-[#F3E5F5]">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span className="text-[10px] text-[#757575]">标签</span>
                    </div>
                    <span className="text-sm text-purple-600 font-semibold leading-none">
                      {member.tagsCount || 0}
                    </span>
                  </div>
                  
                  {/* 联络数 */}
                  <div className="flex flex-col items-center px-1.5 py-1 rounded bg-[#FAF3ED]">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <svg className="w-3 h-3 text-[#CBA471]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="text-[10px] text-[#757575]">联络</span>
                    </div>
                    <span className="text-sm text-[#CBA471] font-semibold leading-none">
                      {member.interactionsCount || 0}
                    </span>
                  </div>
                </div>

                {/* 预留扩展区域（可在此添加更多内容） */}
                <div className="mt-2 min-h-[20px]">
                  {/* 此处预留空间，可添加其他功能 */}
                </div>
              </CardContent>
            </Card>
          ))
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
