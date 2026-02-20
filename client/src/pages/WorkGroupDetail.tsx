import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ChevronRight, ChevronLeft, Users, UserPlus, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * 脉动节点工作平台 - 第二层：群详情（人员列表）
 */
export default function WorkGroupDetail() {
  const params = useParams();
  const groupId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberDescription, setNewMemberDescription] = useState("");
  const [dialogBottom, setDialogBottom] = useState<number | null>(null);

  // 获取工作群详情
  const { data: groupData, isLoading: groupLoading } = trpc.workGroups.getById.useQuery({ id: groupId });
  const group = groupData?.data;

  // 获取工作群人员列表
  const { data: membersData, isLoading: membersLoading, refetch } = trpc.workGroups.getMembers.useQuery({ id: groupId });
  const members = membersData?.data || [];

  // 添加人员的mutation
  const addMemberMutation = trpc.workGroups.addMember.useMutation({
    onSuccess: () => {
      toast.success('人员添加成功');
      setShowAddMemberDialog(false);
      setNewMemberName("");
      setNewMemberDescription("");
      refetch();
    },
    onError: (error) => {
      toast.error(`添加失败: ${error.message}`);
    },
  });

  // 监听键盘弹出和收起
  useEffect(() => {
    if (!showAddMemberDialog) return;

    const handleResize = () => {
      // 获取视口高度
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const windowHeight = window.innerHeight;
      
      // 如果视口高度小于窗口高度，说明键盘弹出了
      if (viewportHeight < windowHeight) {
        // 键盘高度 = 窗口高度 - 视口高度
        const keyboardHeight = windowHeight - viewportHeight;
        // 设置对话框底部距离为键盘高度 + 一点间距
        setDialogBottom(keyboardHeight + 16);
      } else {
        // 键盘收起，居中显示
        setDialogBottom(null);
      }
    };

    // 监听visualViewport的resize事件（更准确地检测键盘）
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
  }, [showAddMemberDialog]);

  // 处理添加人员
  const handleAddMember = () => {
    if (!newMemberName.trim()) {
      toast.error('请输入人员名称');
      return;
    }

    addMemberMutation.mutate({
      groupId,
      name: newMemberName.trim(),
      description: newMemberDescription.trim() || undefined,
    });
  };

  // 动态计算对话框样式
  const dialogStyle = dialogBottom !== null
    ? {
        position: 'fixed' as const,
        bottom: `${dialogBottom}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        top: 'auto',
        maxHeight: '60vh',
      }
    : {};

  if (groupLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">工作群不存在</h3>
          <Button onClick={() => setLocation("/work-groups")} variant="outline">
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/work-groups")}
                className="text-gray-600"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-gray-900">{group.name}</h1>
            </div>
            <Button
              onClick={() => setShowAddMemberDialog(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              添加人员
            </Button>
          </div>
          {group.description && (
            <p className="text-sm text-gray-500 pl-12">{group.description}</p>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 统计信息 */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600">
            <Users className="h-5 w-5" />
            <span className="text-sm">共 {members.length} 人</span>
          </div>
        </div>

        {/* 人员列表 */}
        {membersLoading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <UserPlus className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无人员</h3>
            <p className="text-gray-500 mb-6">添加第一个人员，开始跟进工作节点</p>
            <Button
              onClick={() => setShowAddMemberDialog(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              添加人员
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <Card
                key={member.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                onClick={() => setLocation(`/ledger/${member.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <UserAvatar
                      username={member.name}
                      avatarUrl={member.icon || undefined}
                      size="md"
                    />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {member.name}
                      </h3>
                      {member.description && (
                        <p className="text-sm text-gray-500 line-clamp-1">
                          {member.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        创建时间: {new Date(member.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-4" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 添加人员对话框 */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent 
          className="sm:max-w-md overflow-y-auto"
          style={dialogStyle}
        >
          <DialogTitle>添加人员</DialogTitle>
          <DialogDescription>
            添加一个新人员到工作群，系统将为其创建独立的工作节点记录账本
          </DialogDescription>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="memberName">人员名称 *</Label>
              <Input
                id="memberName"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="请输入人员名称"
                maxLength={100}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="memberDescription">备注信息（可选）</Label>
              <Input
                id="memberDescription"
                value={newMemberDescription}
                onChange={(e) => setNewMemberDescription(e.target.value)}
                placeholder="请输入备注信息"
                maxLength={200}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMemberDialog(false);
                setNewMemberName("");
                setNewMemberDescription("");
              }}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!newMemberName.trim() || addMemberMutation.isPending}
              className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
              {addMemberMutation.isPending ? '添加中...' : '添加'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
