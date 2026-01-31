import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

type Permission = "all" | "own" | "none";

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

interface PermissionMenuState {
  show: boolean;
  memberId: number | 'default' | null;
  permissionType: "view" | "add" | "edit" | "delete" | null;
  position: { top: number; left: number };
}

const LedgerPermissions = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  // 权限菜单状态
  const [permissionMenu, setPermissionMenu] = useState<PermissionMenuState>({
    show: false,
    memberId: null,
    permissionType: null,
    position: { top: 0, left: 0 },
  });

  // 获取账本成员权限列表
  const { data, refetch } = trpc.ledger.getMemberPermissions.useQuery({
    ledgerId,
  });
  
  const members = data?.members || [];
  const defaultPermissions = data?.defaultPermissions || {
    view: 'own' as Permission,
    add: 'own' as Permission,
    edit: 'own' as Permission,
    delete: 'own' as Permission,
  };

  // 更新成员权限
  const updatePermissionMutation = trpc.ledger.updateMemberPermission.useMutation({
    onSuccess: () => {
      refetch();
      setPermissionMenu({ show: false, memberId: null, permissionType: null, position: { top: 0, left: 0 } });
    },
    onError: (error) => {
      toast.error(error.message || "更新权限失败");
    },
  });
  
  // 更新默认成员权限
  const updateDefaultPermissionMutation = trpc.ledger.updateDefaultPermission.useMutation({
    onSuccess: () => {
      refetch();
      setPermissionMenu({ show: false, memberId: null, permissionType: null, position: { top: 0, left: 0 } });
    },
    onError: (error) => {
      toast.error(error.message || "更新默认权限失败");
    },
  });

  // 显示权限选择菜单
  const showPermissionMenu = (
    event: React.MouseEvent,
    memberId: number | 'default',
    permissionType: "view" | "add" | "edit" | "delete"
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPermissionMenu({
      show: true,
      memberId,
      permissionType,
      position: {
        top: rect.bottom + window.scrollY,
        left: rect.left + rect.width / 2,
      },
    });
  };

  // 选择权限
  const selectPermission = (permission: Permission) => {
    if (permissionMenu.memberId && permissionMenu.permissionType) {
      if (permissionMenu.memberId === 'default') {
        // 更新默认权限
        updateDefaultPermissionMutation.mutate({
          ledgerId,
          permissionType: permissionMenu.permissionType,
          permissionValue: permission,
        });
      } else {
        // 更新成员权限
        updatePermissionMutation.mutate({
          ledgerId,
          memberId: permissionMenu.memberId,
          permissionType: permissionMenu.permissionType,
          permissionValue: permission,
        });
      }
    }
  };

  // 获取权限显示文本
  const getPermissionText = (permission: Permission) => {
    switch (permission) {
      case "all":
        return "全部";
      case "own":
        return "仅自己";
      case "none":
        return "不允许";
      default:
        return "全部";
    }
  };

  // 获取权限按钮样式
  const getPermissionButtonClass = (permission: Permission) => {
    switch (permission) {
      case "all":
        return "text-green-600 font-medium text-sm";
      case "own":
        return "text-orange-500 font-medium text-sm";
      case "none":
        return "text-red-500 font-medium text-sm";
      default:
        return "text-green-600 font-medium text-sm";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          家庭记账
        </h1>
      </div>

      {/* 权限表格 */}
      <div className="bg-white">
        {/* 表头 */}
        <div className="grid grid-cols-5 border-b border-gray-200 text-sm text-gray-700 font-medium">
          <div className="py-3 px-2 text-center flex items-center justify-center">成员</div>
          <div className="py-3 px-2 text-center border-l border-gray-200 flex items-center justify-center">
            <span className="leading-tight">查看<br />账目</span>
          </div>
          <div className="py-3 px-2 text-center border-l border-gray-200 flex items-center justify-center">
            <span className="leading-tight">添加<br />账目</span>
          </div>
          <div className="py-3 px-2 text-center border-l border-gray-200 flex items-center justify-center">
            <span className="leading-tight">修改<br />账目</span>
          </div>
          <div className="py-3 px-2 text-center border-l border-gray-200 flex items-center justify-center">
            <span className="leading-tight">删除<br />账目</span>
          </div>
        </div>

        {/* 成员列表 */}
        {members.map((member) => (
          <div
            key={member.id}
            className="grid grid-cols-5 border-b border-gray-100"
          >
            {/* 成员信息 */}
            <div className="py-4 px-2 flex flex-col items-center justify-center gap-1">
              <UserAvatar
                username={member.userName}
                avatar={member.userAvatar}
                size="sm"
              />
              <span className="text-xs text-gray-600 truncate max-w-[60px]">
                {member.userName}
              </span>
            </div>

            {/* 查看账目权限 */}
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium text-sm">全部</span>
              ) : (
                <button
                  onClick={(e) => showPermissionMenu(e, member.id, "view")}
                  className={getPermissionButtonClass(member.permissionView)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionView)}
                </button>
              )}
            </div>

            {/* 添加账目权限 */}
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium text-sm">全部</span>
              ) : (
                <button
                  onClick={(e) => showPermissionMenu(e, member.id, "add")}
                  className={getPermissionButtonClass(member.permissionAdd)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionAdd)}
                </button>
              )}
            </div>

            {/* 修改账目权限 */}
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium text-sm">全部</span>
              ) : (
                <button
                  onClick={(e) => showPermissionMenu(e, member.id, "edit")}
                  className={getPermissionButtonClass(member.permissionEdit)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionEdit)}
                </button>
              )}
            </div>

            {/* 删除账目权限 */}
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
              {member.role === "owner" ? (
                <span className="text-green-600 font-medium text-sm">全部</span>
              ) : (
                <button
                  onClick={(e) => showPermissionMenu(e, member.id, "delete")}
                  className={getPermissionButtonClass(member.permissionDelete)}
                  disabled={updatePermissionMutation.isPending}
                >
                  {getPermissionText(member.permissionDelete)}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 新加入成员 */}
        <div className="grid grid-cols-5 border-b border-gray-100 bg-gray-50">
          <div className="py-4 px-2 flex items-center justify-center text-gray-500 text-sm">
            <span className="leading-tight">新加入<br />成员</span>
          </div>
          <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
            <button
              onClick={(e) => showPermissionMenu(e, 'default', "view")}
              className={getPermissionButtonClass(defaultPermissions.view)}
              disabled={updateDefaultPermissionMutation.isPending}
            >
              {getPermissionText(defaultPermissions.view)}
            </button>
          </div>
          <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
            <button
              onClick={(e) => showPermissionMenu(e, 'default', "add")}
              className={getPermissionButtonClass(defaultPermissions.add)}
              disabled={updateDefaultPermissionMutation.isPending}
            >
              {getPermissionText(defaultPermissions.add)}
            </button>
          </div>
          <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
            <button
              onClick={(e) => showPermissionMenu(e, 'default', "edit")}
              className={getPermissionButtonClass(defaultPermissions.edit)}
              disabled={updateDefaultPermissionMutation.isPending}
            >
              {getPermissionText(defaultPermissions.edit)}
            </button>
          </div>
          <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100">
            <button
              onClick={(e) => showPermissionMenu(e, 'default', "delete")}
              className={getPermissionButtonClass(defaultPermissions.delete)}
              disabled={updateDefaultPermissionMutation.isPending}
            >
              {getPermissionText(defaultPermissions.delete)}
            </button>
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

      {/* 权限选择菜单 */}
      {permissionMenu.show && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPermissionMenu({ show: false, memberId: null, permissionType: null, position: { top: 0, left: 0 } })}
          />
          
          {/* 菜单 */}
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
            style={{
              top: `${permissionMenu.position.top}px`,
              left: `${permissionMenu.position.left}px`,
              transform: "translateX(-50%)",
              minWidth: "100px",
            }}
          >
            <button
              onClick={() => selectPermission("all")}
              className="w-full px-4 py-3 text-sm text-green-600 font-medium text-center border-b border-gray-100 last:border-b-0 active:bg-gray-50"
            >
              全部
            </button>
            <button
              onClick={() => selectPermission("own")}
              className="w-full px-4 py-3 text-sm text-orange-500 font-medium text-center border-b border-gray-100 last:border-b-0 active:bg-gray-50"
            >
              仅自己
            </button>
            <button
              onClick={() => selectPermission("none")}
              className="w-full px-4 py-3 text-sm text-red-500 font-medium text-center border-b border-gray-100 last:border-b-0 active:bg-gray-50"
            >
              不允许
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LedgerPermissions;
