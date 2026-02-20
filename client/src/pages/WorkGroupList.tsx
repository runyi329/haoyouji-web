import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ChevronRight, Users, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * 脉动节点工作平台 - 第一层：工作台首页（群列表）
 */
export default function WorkGroupList() {
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);

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

  // 监听键盘弹出和收起，动态调整可视区域高度
  useEffect(() => {
    if (!showCreateDialog) return;

    const handleResize = () => {
      // 使用visualViewport获取实际可视区域高度（扣除键盘）
      const vh = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(vh);
    };

    // 监听visualViewport的resize事件
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    
    // 也监听window的resize事件作为备用
    window.addEventListener('resize', handleResize);

    // 初始化时检查一次
    handleResize();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [showCreateDialog]);

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

  // 动态计算对话框样式 - 让对话框在可视区域内垂直居中，并紧贴键盘上沿
  const dialogStyle = {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxHeight: `${Math.min(viewportHeight * 0.8, 500)}px`, // 最大高度为可视区域的80%或500px
    width: '90%',
    maxWidth: '448px',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              className="text-gray-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-gray-900">脉动节点工作平台</h1>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
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
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
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
                className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                onClick={() => setLocation(`/work-groups/${group.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {group.name}
                    </h3>
                    {group.description && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      创建时间: {new Date(group.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-4" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 创建工作群对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent 
          className="overflow-y-auto"
          style={dialogStyle}
        >
          <DialogTitle>创建工作群</DialogTitle>
          <DialogDescription>
            创建一个新的工作群来管理您的团队成员和工作节点
          </DialogDescription>
          <div className="space-y-4 mt-4">
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
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewGroupName("");
                setNewGroupDescription("");
              }}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newGroupName.trim() || createMutation.isPending}
              className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
