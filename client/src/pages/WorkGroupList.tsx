import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ChevronRight, Users, ChevronLeft } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * 脉动节点合作平台 - 第一层：工作台首页（群列表）
 */
export default function WorkGroupList() {
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  // 获取工作群列表
  const { data: groupsData, isLoading, refetch } = trpc.workGroups.list.useQuery();
  const groups = groupsData?.data || [];

  // 创建工作群的mutation
  const createMutation = trpc.workGroups.create.useMutation({
    onSuccess: () => {
      toast.success('工作群创建成功');
      setShowCreateDialog(false);
      setNewGroupName("");
      setNewGroupDescription("");
      refetch();
    },
    onError: (error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });

  // 处理创建工作群
  const handleCreate = () => {
    if (!newGroupName.trim()) {
      toast.error('请输入工作群名称');
      return;
    }

    createMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F]-dark sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              className="text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-white">脉动节点合作平台</h1>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="btn-primary-gold"
          >
            <Plus className="h-4 w-4 mr-1" />
            创建工作群
          </Button>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <Users className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无工作群</h3>
            <p className="text-gray-500 mb-6">创建第一个工作群，开始管理您的团队</p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="btn-primary-gold"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建工作群
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Card
                key={group.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-divider bg-white"
                onClick={() => setLocation(`/work-groups/${group.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[#222222] mb-1">
                      {group.name}
                    </h3>
                    {group.description && (
                      <p className="text-sm text-[#757575] line-clamp-2">
                        {group.description}
                      </p>
                    )}
                    <p className="text-xs text-[#757575] mt-2">
                      创建时间: {new Date(group.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#757575] flex-shrink-0 ml-4" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 创建工作群抽屉 */}
      <Drawer open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DrawerContent className="fixed top-0 left-0 right-0 bottom-0 flex flex-col bg-white rounded-t-[10px] mt-[env(safe-area-inset-top)]" style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top))' }}>
          <DrawerHeader>
            <DrawerTitle>创建工作群</DrawerTitle>
            <DrawerDescription>
              创建一个新的工作群来管理您的团队成员和工作节点
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 space-y-4 flex-1 overflow-y-auto">
            <div>
              <Label htmlFor="groupName">工作群名称 *</Label>
              <Input
                id="groupName"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="请输入工作群名称"
                maxLength={100}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="groupDescription">工作群描述（可选）</Label>
              <Input
                id="groupDescription"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="请输入工作群描述"
                maxLength={200}
                className="mt-1"
              />
            </div>
          </div>
          <DrawerFooter className="mt-auto">
            <Button
              onClick={handleCreate}
              disabled={!newGroupName.trim() || createMutation.isPending}
              className="w-full btn-primary-gold"
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setNewGroupName("");
                  setNewGroupDescription("");
                }}
              >
                取消
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
