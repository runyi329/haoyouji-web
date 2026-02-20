import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function UserPermissionsManager() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  
  // 获取所有用户
  const { data: users } = trpc.admin.getUsers.useQuery();
  
  // 获取所有可用功能
  const { data: allFeatures } = trpc.admin.getAllFeatures.useQuery();
  
  // 获取选中用户的权限
  const { data: userPermissions, refetch: refetchPermissions } = trpc.admin.getUserPermissions.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );
  
  // 设置权限mutation
  const setPermissionsMutation = trpc.admin.setUserPermissions.useMutation({
    onSuccess: () => {
      toast.success("权限设置成功");
      refetchPermissions();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 获取用户当前的权限状态
  const getPermissionStatus = (featureKey: string): boolean => {
    if (!userPermissions) return true; // 默认启用
    const perm = userPermissions.find((p) => p.featureKey === featureKey);
    return perm ? perm.isEnabled : true; // 没有记录默认启用
  };
  
  // 切换权限
  const togglePermission = async (featureKey: string) => {
    if (!selectedUserId) return;
    
    const currentStatus = getPermissionStatus(featureKey);
    const newStatus = !currentStatus;
    
    await setPermissionsMutation.mutateAsync({
      userId: selectedUserId,
      permissions: [{ featureKey, isEnabled: newStatus }],
    });
  };
  
  const selectedUser = users?.find((u) => u.id === selectedUserId);
  
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5 text-brand-red" />
        <h2 className="text-xl font-bold">用户功能权限管理</h2>
      </div>
      
      <div className="space-y-6">
        {/* 选择用户 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">选择用户</label>
          <Select
            value={selectedUserId?.toString() || ""}
            onValueChange={(value) => setSelectedUserId(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择用户" />
            </SelectTrigger>
            <SelectContent>
              {users?.map((user) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.name || user.username} ({user.role === "super_admin" ? "超级管理员" : user.role === "parent" ? "家长" : "宝宝"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* 权限列表 */}
        {selectedUserId && allFeatures && (
          <div className="space-y-3">
            <h3 className="font-medium">功能权限</h3>
            <div className="grid gap-3">
              {allFeatures.map((feature) => {
                const isEnabled = getPermissionStatus(feature.key);
                return (
                  <div
                    key={feature.key}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{feature.name}</div>
                      <div className="text-sm text-muted-foreground">{feature.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant={isEnabled ? "default" : "outline"}
                      onClick={() => togglePermission(feature.key)}
                      disabled={setPermissionsMutation.isPending}
                      className={isEnabled ? "bg-green-500 hover:bg-green-600" : ""}
                    >
                      {isEnabled ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          已启用
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4 mr-1" />
                          已禁用
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {!selectedUserId && (
          <div className="text-center text-muted-foreground py-8">
            请先选择一个用户
          </div>
        )}
      </div>
    </Card>
  );
}
