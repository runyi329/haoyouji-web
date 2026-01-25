import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Minus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function PointsManagement() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; points: number } | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);

  // 获取所有用户
  const { data: usersData, isLoading, refetch } = trpc.pointSystem.getAllUsers.useQuery({
    page: 1,
    pageSize: 100,
  });

  // 搜索用户
  const { data: searchResults, isLoading: isSearching } = trpc.pointSystem.searchUsers.useQuery(
    { keyword: searchKeyword },
    { enabled: searchKeyword.length > 0 }
  );

  // 调整积分
  const adjustMutation = trpc.pointSystem.adjustUserPoints.useMutation({
    onSuccess: () => {
      toast.success("积分调整成功");
      setShowAdjustDialog(false);
      setSelectedUser(null);
      setAdjustPoints("");
      setAdjustDescription("");
      refetch();
    },
    onError: (error) => {
      toast.error(`调整失败：${error.message}`);
    },
  });

  const handleAdjust = (user: { id: number; username: string; points: number }) => {
    setSelectedUser(user);
    setShowAdjustDialog(true);
  };

  const handleConfirmAdjust = () => {
    if (!selectedUser) return;
    
    const points = parseInt(adjustPoints);
    if (isNaN(points) || points === 0) {
      toast.error("请输入有效的积分值");
      return;
    }

    if (!adjustDescription.trim()) {
      toast.error("请输入调整原因");
      return;
    }

    adjustMutation.mutate({
      userId: selectedUser.id,
      points,
      description: adjustDescription,
    });
  };

  const displayUsers = searchKeyword.length > 0 ? searchResults : usersData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container py-4">
          <h1 className="text-2xl font-bold text-gray-900">积分管理</h1>
          <p className="text-sm text-gray-600 mt-1">管理用户积分，添加或减少积分</p>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* 搜索框 */}
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="搜索用户名..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        {/* 用户列表 */}
        {isLoading || isSearching ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : displayUsers && displayUsers.length > 0 ? (
          <div className="space-y-3">
            {displayUsers.map((user: any) => (
              <Card key={user.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{user.username}</div>
                    <div className="text-2xl font-bold text-indigo-600 mt-1">
                      {user.points || 0} 积分
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdjust(user)}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      添加
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdjust(user)}
                      className="gap-1"
                    >
                      <Minus className="h-4 w-4" />
                      减少
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            {searchKeyword ? "未找到匹配的用户" : "暂无用户"}
          </div>
        )}
      </div>

      {/* 调整积分对话框 */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>用户</Label>
              <div className="text-lg font-medium mt-1">{selectedUser?.username}</div>
              <div className="text-sm text-gray-600">
                当前积分：{selectedUser?.points || 0}
              </div>
            </div>
            <div>
              <Label htmlFor="points">积分变动</Label>
              <Input
                id="points"
                type="number"
                placeholder="正数为添加，负数为减少"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                className="mt-1"
              />
              <div className="text-xs text-gray-500 mt-1">
                例如：+10 表示添加10积分，-5 表示减少5积分
              </div>
            </div>
            <div>
              <Label htmlFor="description">调整原因</Label>
              <Textarea
                id="description"
                placeholder="请输入调整原因..."
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAdjustDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmAdjust}
              disabled={adjustMutation.isPending}
            >
              {adjustMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
