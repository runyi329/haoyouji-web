import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Edit, Trash2, Star, Gift } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export default function RewardsManagement() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  
  // 表单状态
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsCost, setPointsCost] = useState("");
  const [icon, setIcon] = useState("");

  const { data: rewards, refetch } = trpc.rewards.list.useQuery();
  
  const createMutation = trpc.rewards.createReward.useMutation({
    onSuccess: () => {
      toast.success("奖品创建成功！");
      setShowCreateDialog(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.rewards.updateReward.useMutation({
    onSuccess: () => {
      toast.success("奖品更新成功！");
      setEditingReward(null);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.rewards.updateReward.useMutation({
    onSuccess: () => {
      toast.success("奖品删除成功！");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // 检查权限
  if (user?.role !== "parent" && user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">权限不足</h2>
          <p className="text-muted-foreground mb-4">只有家长可以访问此页面</p>
          <Button onClick={() => navigate("/")}>返回首页</Button>
        </Card>
      </div>
    );
  }

  const resetForm = () => {
    setName("");
    setDescription("");
    setPointsCost("");
    setIcon("");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pointsCost) {
      toast.error("请填写必填项");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      pointsCost: parseInt(pointsCost),
      icon: icon.trim() || "🎁",
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pointsCost || !editingReward) {
      toast.error("请填写必填项");
      return;
    }
    updateMutation.mutate({
      id: editingReward.id,
      name: name.trim(),
      description: description.trim(),
      pointsCost: parseInt(pointsCost),
      icon: icon.trim() || "🎁",
    });
  };

  const handleEdit = (reward: any) => {
    setEditingReward(reward);
    setName(reward.name);
    setDescription(reward.description || "");
    setPointsCost(reward.pointsCost.toString());
    setIcon(reward.icon || "");
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`确定要删除奖品“${name}”吗？`)) {
      // 通过设置isActive为false来“删除”奖品
      deleteMutation.mutate({ id, isActive: false });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/parent")}
            className="flex items-center gap-2 text-[#757575] hover:text-[#424242]"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回家长中心</span>
          </button>
          <h1 className="text-xl font-bold">奖品管理</h1>
          <div className="w-32"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-lg">我的奖品</h2>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-amber-500 to-orange-500">
                  <Plus className="w-4 h-4 mr-2" />
                  添加奖品
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加新奖品</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>奖品名称 *</Label>
                    <Input
                      placeholder="例如：玩具小汽车"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>奖品描述</Label>
                    <Textarea
                      placeholder="描述这个奖品..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>所需星星数 *</Label>
                    <Input
                      type="number"
                      placeholder="例如：10"
                      value={pointsCost}
                      onChange={(e) => setPointsCost(e.target.value)}
                      min="1"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>图标（Emoji）</Label>
                    <Input
                      placeholder="例如：🎁 🚗 🎮"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      maxLength={2}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                      取消
                    </Button>
                    <Button type="submit">创建</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 奖品列表 */}
          {!rewards || rewards.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">还没有添加奖品</p>
              <p className="text-sm text-muted-foreground">点击上方"添加奖品"按钮开始创建</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards.map((reward) => (
                <Card key={reward.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col items-center text-center">
                    <div className="text-6xl mb-4">{reward.icon || "🎁"}</div>
                    <h3 className="font-bold text-lg mb-2">{reward.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {reward.description || "暂无描述"}
                    </p>
                    <div className="flex items-center gap-2 mb-4">
                      <Star className="w-5 h-5 text-[#FFA726] fill-amber-500" />
                      <span className="font-bold text-[#CBA471]">{reward.pointsCost} 颗星星</span>
                    </div>
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(reward)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-[#D32F2F] hover:text-[#D32F2F]"
                        onClick={() => handleDelete(reward.id, reward.name)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        删除
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 提示信息 */}
          <div className="mt-6 p-4 rounded-lg bg-[#FAF3ED] border border-[#FFA726]">
            <p className="text-sm text-[#FFA726]">
              <strong>提示：</strong>在这里添加和管理您为宝贝准备的奖品。宝贝可以用游戏获得的星星在"星星商城"兑换这些奖品。
            </p>
          </div>
        </Card>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={!!editingReward} onOpenChange={(open) => !open && setEditingReward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑奖品</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>奖品名称 *</Label>
              <Input
                placeholder="例如：玩具小汽车"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>奖品描述</Label>
              <Textarea
                placeholder="描述这个奖品..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>所需星星数 *</Label>
              <Input
                type="number"
                placeholder="例如：10"
                value={pointsCost}
                onChange={(e) => setPointsCost(e.target.value)}
                min="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>图标（Emoji）</Label>
              <Input
                placeholder="例如：🎁 🚗 🎮"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingReward(null)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
