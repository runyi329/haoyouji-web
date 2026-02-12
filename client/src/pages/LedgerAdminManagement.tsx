import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { ChevronLeft } from "lucide-react";
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

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members, refetch } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 设置成员角色的mutation
  const utils = trpc.useUtils();
  const setRoleMutation = trpc.ledger.setMemberRole.useMutation({
    onSuccess: () => {
      toast.success("角色设置成功");
      utils.ledger.getMembers.invalidate({ ledgerId });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "设置失败");
    },
  });

  // 处理角色变更
  const handleRoleChange = (memberId: number, newRole: 'admin' | 'member') => {
    setRoleMutation.mutate({
      ledgerId,
      memberId,
      role: newRole,
    });
  };

  // 获取角色显示文本
  const getRoleText = (role: string) => {
    switch (role) {
      case 'owner':
        return '创始人';
      case 'admin':
        return '管理员';
      case 'member':
        return '普通成员';
      default:
        return '未知';
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

  // 只有owner可以访问此页面
  if (ledgerData.userRole !== 'owner') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">只有账本所有者可以管理管理员</div>
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
            账本管理员管理
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 说明文字 */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mt-3 mx-4">
        <p className="text-sm text-blue-700">
          管理员可以管理报销、审批账目等，但不能删除账本或封存账本。
        </p>
      </div>

      {/* 成员列表 */}
      <div className="bg-white mt-3">
        <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-100">
          成员列表
        </div>
        
        {members?.map((member) => (
          <div 
            key={member.userId} 
            className="flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-b-0"
          >
            <div className="flex items-center gap-3 flex-1">
              <UserAvatar
                username={member.username}
                avatar={member.avatar}
                nickname={member.nickname}
                size="md"
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1">
                <div className="text-base font-medium text-gray-900">
                  {member.nickname || member.username}
                </div>
                <div className="text-sm text-gray-500">
                  加入时间：{new Date(member.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="ml-4">
              {member.role === 'owner' ? (
                <div className="px-3 py-1.5 rounded-full text-sm font-medium text-white" style={{ backgroundColor: themeColors.primary }}>
                  创始人
                </div>
              ) : (
                <Select
                  value={member.role}
                  onValueChange={(value) => handleRoleChange(member.userId, value as 'admin' | 'member')}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="member">普通成员</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 权限说明 */}
      <div className="bg-white mt-3">
        <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-100">
          权限说明
        </div>
        <div className="px-4 py-4 space-y-3 text-sm">
          <div>
            <div className="font-medium text-gray-900 mb-1">创始人</div>
            <div className="text-gray-600">拥有所有权限，包括删除账本、封存账本、设置管理员等</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 mb-1">管理员</div>
            <div className="text-gray-600">可以管理报销、审批账目、管理分类等，但不能删除账本或封存账本</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 mb-1">普通成员</div>
            <div className="text-gray-600">可以添加账目、查看账目、申请报销等基本功能</div>
          </div>
        </div>
      </div>
    </div>
  );
}
