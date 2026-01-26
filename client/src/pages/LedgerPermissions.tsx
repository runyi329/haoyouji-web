import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Permission = "all" | "own";

interface MemberPermission {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string;
  role: "owner" | "member";
  permissionView: Permission;
  permissionAdd: Permission;
  permissionEdit: Permission;
  permissionDelete: Permission;
}

const LedgerPermissions = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  // 获取账本成员权限列表
  const { data: members = [], refetch } = trpc.ledger.getMemberPermissions.useQuery({
    ledgerId,
  });

  // 更新成员权限
  const updatePermissionMutation = trpc.ledger.updateMemberPermission.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "更新权限失败");
    },
  });

  // 切换权限
  const togglePermission = (
    memberId: number,
    permissionType: "view" | "add" | "edit" | "delete",
    currentValue: Permission
  ) => {
    const newValue: Permission = currentValue === "all" ? "own" : "all";
    
    updatePermissionMutation.mutate({
      ledgerId,
      memberId,
      permissionType,
      permissionValue: newValue,
    });
  };

  // 获取权限显示文本
  const getPermissionText = (permission: Permission) => {
    return permission === "all" ? "全部" : "仅自己";
  };

  // 获取权限按钮样式
  const getPermissionButtonClass = (permission: Permission) => {
    return permission === "all"
      ? "text-green-600 font-medium"
      : "text-orange-500 font-medium";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          {members[0]?.ledgerName || "家庭记账"}
        </h1>
      </div>

      {/* 权限表格 */}
      <div className="bg-white">
        {/* 表头 */}
        <div className="grid grid-cols-5 border-b border-gray-200 text-xs text-gray-700 font-medium">
          <div className="p-3 text-center">成员</div>
          <div className="p-3 text-center border-l border-gray-200">
            查看
            <br />
            账目
          </div>
          <div className="p-3 text-center border-l border-gray-200">
            添加
            <br />
            账目
          </div>
          <div className="p-3 text-center border-l border-gray-200">
            修改
            <br />
            账目
          </div>
          <div className="p-3 text-center border-l border-gray-200">
            删除
            <br />
            账目
          </div>
        </div>

        {/* 成员列表 */}
        {members.map((member) => (
          <div
            key={member.id}
            className="grid grid-cols-5 border-b border-gray-100 text-sm"
          >
            {/* 成员信息 */}
            <div className="p-3 flex items-center justify-center">
              <img
                src={member.userAvatar}
                alt={member.userName}
                className="w-10 h-10 rounded-full"
              />
            </div>

            {/* 查看账目权限 */}
            <div className="p-3 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium">全部</span>
              ) : (
                <button
                  onClick={() =>
                    togglePermission(member.id, "view", member.permissionView)
                  }
                  className={getPermissionButtonClass(member.permissionView)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionView)}
                </button>
              )}
            </div>

            {/* 添加账目权限 */}
            <div className="p-3 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium">全部</span>
              ) : (
                <button
                  onClick={() =>
                    togglePermission(member.id, "add", member.permissionAdd)
                  }
                  className={getPermissionButtonClass(member.permissionAdd)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionAdd)}
                </button>
              )}
            </div>

            {/* 修改账目权限 */}
            <div className="p-3 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium">全部</span>
              ) : (
                <button
                  onClick={() =>
                    togglePermission(member.id, "edit", member.permissionEdit)
                  }
                  className={getPermissionButtonClass(member.permissionEdit)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionEdit)}
                </button>
              )}
            </div>

            {/* 删除账目权限 */}
            <div className="p-3 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium">全部</span>
              ) : (
                <button
                  onClick={() =>
                    togglePermission(member.id, "delete", member.permissionDelete)
                  }
                  className={getPermissionButtonClass(member.permissionDelete)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionDelete)}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 新加入成员（占位） */}
        <div className="grid grid-cols-5 border-b border-gray-100 text-sm bg-gray-50">
          <div className="p-3 flex items-center justify-center text-gray-500 text-xs">
            新加入
            <br />
            成员
          </div>
          <div className="p-3 flex items-center justify-center border-l border-gray-100">
            <span className="text-green-600 font-medium text-xs">全部</span>
          </div>
          <div className="p-3 flex items-center justify-center border-l border-gray-100">
            <span className="text-green-600 font-medium text-xs">全部</span>
          </div>
          <div className="p-3 flex items-center justify-center border-l border-gray-100">
            <span className="text-orange-500 font-medium text-xs">仅自己</span>
          </div>
          <div className="p-3 flex items-center justify-center border-l border-gray-100">
            <span className="text-orange-500 font-medium text-xs">仅自己</span>
          </div>
        </div>
      </div>

      {/* 说明文字 */}
      <div className="p-4 text-xs text-gray-500">
        <p className="mb-2">
          <span className="text-green-600 font-medium">全部</span>：可以查看/操作账本中的所有账目
        </p>
        <p>
          <span className="text-orange-500 font-medium">仅自己</span>：只能查看/操作自己添加的账目
        </p>
      </div>
    </div>
  );
};

export default LedgerPermissions;
