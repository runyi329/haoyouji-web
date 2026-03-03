import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LedgerAdminManagement() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    userId: number;
    username: string;
  }>({ show: false, userId: 0, username: '' });
  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members, refetch } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 设置成员角色 - 使用targetUserId
  const utils = trpc.useUtils();
  const setRoleMutation = trpc.ledger.setMemberRole.useMutation({
    onSuccess: () => {
      toast.success("角色设置成功");
      utils.ledger.getMembers.invalidate({ ledgerId });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "设置失败");
    },
  });

  // 删除成员 - 使用userId
  const removeMemberMutation = trpc.ledger.removeMember.useMutation({
    onSuccess: () => {
      toast.success("成员已移除");
      setDeleteConfirm({ show: false, userId: 0, username: '' });
      utils.ledger.getMembers.invalidate({ ledgerId });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "移除失败");
      setDeleteConfirm({ show: false, userId: 0, username: '' });
    },
  });

  // 处理角色变更
  const handleRoleChange = (targetUserId: number, newRole: 'admin' | 'member') => {
    setRoleMutation.mutate({
      ledgerId,
      targetUserId,
      role: newRole,
    });
  };

  // 处理删除成员
  const handleDeleteMember = () => {
    if (deleteConfirm.userId) {
      removeMemberMutation.mutate({
        ledgerId,
        userId: deleteConfirm.userId,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">账本不存在</div>
      </div>
    );
  }

  const isDiet = (ledgerData as any).type === 'diet';
  // 只有owner可以访问此页面
  if (ledgerData.userRole !== 'owner') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">{isDiet ? '只有账本创建人可以管理教练' : '只有账本所有者可以管理管理员'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">
            {isDiet ? '减肥教练管理' : '账本管理员管理'}
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 说明文字 */}
      <div className="bg-[#F5F5F5] border-l-4 border-blue-400 p-4 mt-3 mx-4 rounded-r-lg">
        <p className="text-sm text-blue-700">
          {isDiet ? '减肥教练可以管理学员档案、设置减肥目标等，但不能删除账本或封存账本。' : '管理员可以管理报销、审批账目等，但不能删除账本或封存账本。'}
        </p>
      </div>

      {/* 成员列表 */}
      <div className="bg-white mt-3 rounded-lg mx-4 overflow-hidden shadow-sm">
        <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-100 font-medium">
          成员列表（{members?.length || 0}人）
        </div>
        
        {members?.map((member: any) => (
          <div 
            key={member.userId} 
            className="flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-b-0"
          >
            {/* 左侧：头像和信息 */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <UserAvatar
                username={member.username}
                avatar={member.avatar}
                nickname={member.nickname}
                size="md"
                className="w-12 h-12 rounded-full flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-gray-900 truncate">
                  {member.nickname || member.username}
                </div>
                <div className="text-xs text-gray-400">
                  加入时间：{new Date(member.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* 右侧：角色选择 + 删除按钮 */}
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              {member.role === 'owner' ? (
                <div 
                  className="px-3 py-1.5 rounded-full text-sm font-medium text-white" 
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  创始人
                </div>
              ) : (
                <>
                  {/* 角色选择下拉框 */}
                  <Select
                    value={member.role}
                    onValueChange={(value: string) => handleRoleChange(member.userId, value as 'admin' | 'member')}
                  >
                    <SelectTrigger className="w-[110px] h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{isDiet ? '减肥教练' : '管理员'}</SelectItem>
                      <SelectItem value="member">普通成员</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => setDeleteConfirm({
                      show: true,
                      userId: member.userId,
                      username: member.nickname || member.username,
                    })}
                    className="p-2 rounded-full hover:bg-[#FFEBEE] text-gray-400 hover:text-[#D32F2F] transition-colors"
                    title="移除成员"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 权限说明 */}
      <div className="bg-white mt-3 rounded-lg mx-4 overflow-hidden shadow-sm">
        <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-100 font-medium">
          权限说明
        </div>
        <div className="px-4 py-4 space-y-3 text-sm">
          <div>
            <div className="font-medium text-gray-900 mb-1">创始人</div>
            <div className="text-gray-600">拥有所有权限，包括删除账本、封存账本、设置管理员等</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 mb-1">{isDiet ? '减肥教练' : '管理员'}</div>
            <div className="text-gray-600">{isDiet ? '可以管理学员档案、设置减肥目标等，但不能删除账本或封存账本' : '可以管理报销、审批账目、管理分类等，但不能删除账本或封存账本'}</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 mb-1">普通成员</div>
            <div className="text-gray-600">可以添加账目、查看账目、申请报销等基本功能</div>
          </div>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-gray-900">确认移除</h3>
              <button
                onClick={() => setDeleteConfirm({ show: false, userId: 0, username: '' })}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            {/* 弹窗内容 */}
            <div className="px-5 py-3">
              <p className="text-sm text-gray-600">
                确定要将 <span className="font-semibold text-gray-900">{deleteConfirm.username}</span> 从账本中移除吗？
              </p>
              <p className="text-xs text-gray-400 mt-2">
                移除后，该成员将无法查看和操作此账本的任何数据。
              </p>
            </div>
            
            {/* 弹窗按钮 */}
            <div className="flex gap-3 px-5 pb-5 pt-2">
              <button
                onClick={() => setDeleteConfirm({ show: false, userId: 0, username: '' })}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={removeMemberMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-[#D32F2F] hover:bg-[#D32F2F] transition-colors disabled:opacity-50"
              >
                {removeMemberMutation.isPending ? '移除中...' : '确认移除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
