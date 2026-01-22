import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  ArrowLeft,
  Trophy,
  Star,
  Medal,
  Gift,
  CheckCircle2,
  Plus,
  Sparkles,
  Clock,
  Edit,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Rewards() {
  const { user, isAuthenticated } = useAuth();
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showCreateRewardDialog, setShowCreateRewardDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPoints, setNewTaskPoints] = useState("10");
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardPoints, setNewRewardPoints] = useState("100");
  const [newRewardIcon, setNewRewardIcon] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [newRewardDescription, setNewRewardDescription] = useState("");

  const { data: badges } = trpc.rewards.getBadges.useQuery();
  const { data: userBadges } = trpc.rewards.getUserBadges.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: tasks, refetch: refetchTasks } = trpc.rewards.getTasks.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: rewards, refetch: refetchRewards } = trpc.rewards.getRewards.useQuery();
  const { data: pointsData } = trpc.rewards.getPoints.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: transactions } = trpc.rewards.getTransactions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createTask = trpc.rewards.createTask.useMutation({
    onSuccess: () => {
      toast.success("任务创建成功！");
      setShowCreateTaskDialog(false);
      setNewTaskTitle("");
      setNewTaskPoints("10");
      refetchTasks();
    },
  });

  const completeTask = trpc.rewards.completeTask.useMutation({
    onSuccess: (data) => {
      toast.success(`任务完成！获得 ${data.pointsEarned} 积分`);
      refetchTasks();
    },
  });

  const createReward = trpc.rewards.createReward.useMutation({
    onSuccess: () => {
      toast.success("奖品创建成功！");
      setShowCreateRewardDialog(false);
      setNewRewardName("");
      setNewRewardPoints("100");
      refetchRewards();
    },
  });

  const uploadAvatar = trpc.specialKids.uploadAvatar.useMutation();

  const updateReward = trpc.rewards.updateReward.useMutation({
    onSuccess: () => {
      toast.success("奖品更新成功！");
      setEditingReward(null);
      setNewRewardName("");
      setNewRewardPoints("100");
      setNewRewardIcon("");
      setNewRewardDescription("");
      refetchRewards();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteReward = trpc.rewards.deleteReward.useMutation({
    onSuccess: () => {
      toast.success("奖品已删除！");
      refetchRewards();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const redeemReward = trpc.rewards.redeemReward.useMutation({
    onSuccess: () => {
      toast.success("兑换成功！");
      refetchRewards();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const userBadgeIds = new Set(userBadges?.map((ub) => ub.badgeId) || []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="z-50 glass border-b border-border/50">
          <div className="container flex items-center h-14">
            <Link href="/">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-bold text-lg">奖励中心</h1>
            </div>
          </div>
        </header>

        <main className="container py-12 text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
            <Trophy className="w-12 h-12 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">登录后查看奖励</h2>
          <p className="text-muted-foreground mb-6">完成任务，收集勋章，兑换惊喜</p>
          <a href={getLoginUrl()}>
            <Button className="btn-gradient">立即登录</Button>
          </a>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center h-14">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-bold text-lg">奖励中心</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* 积分卡片 */}
        <Card className="p-6 mb-6 bg-gradient-to-br from-amber-400 to-orange-500 border-0 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm mb-1">我的积分</p>
              <div className="flex items-center gap-2">
                <Star className="w-8 h-8 fill-white" />
                <span className="text-4xl font-bold">{pointsData?.points || user?.points || 0}</span>
              </div>
            </div>
            <div className="text-right">
              <Sparkles className="w-12 h-12 text-white/30" />
            </div>
          </div>
        </Card>

        {/* 标签页 */}
        <Tabs defaultValue="badges" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="badges" className="text-xs">
              <Medal className="w-4 h-4 mr-1" />
              勋章
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">
              <CheckCircle2 className="w-4 h-4 mr-1" />
              任务
            </TabsTrigger>
            <TabsTrigger value="rewards" className="text-xs">
              <Gift className="w-4 h-4 mr-1" />
              兑换
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <Clock className="w-4 h-4 mr-1" />
              记录
            </TabsTrigger>
          </TabsList>

          {/* 勋章 */}
          <TabsContent value="badges">
            <div className="grid grid-cols-3 gap-4">
              {badges?.map((badge) => {
                const earned = userBadgeIds.has(badge.id);
                return (
                  <Card
                    key={badge.id}
                    className={`p-4 text-center border-0 ${
                      earned ? "bg-amber-50" : "bg-muted/50 opacity-60"
                    }`}
                  >
                    <div
                      className={`w-14 h-14 mx-auto mb-2 rounded-full flex items-center justify-center text-2xl ${
                        earned ? "badge-shine bg-gradient-to-br from-amber-300 to-orange-400" : "bg-muted"
                      }`}
                    >
                      {badge.icon || "🏅"}
                    </div>
                    <h4 className="font-bold text-sm mb-1">{badge.name}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">{badge.description}</p>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* 任务 */}
          <TabsContent value="tasks">
            <div className="space-y-4">
              {/* 创建任务按钮（家长） */}
              {user?.role === "super_admin" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowCreateTaskDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建新任务
                </Button>
              )}

              {tasks && tasks.length > 0 ? (
                tasks.map((task) => (
                  <Card key={task.id} className="p-4 border-0 shadow-soft">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold">{task.title}</h4>
                        {task.description && (
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-amber-500">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-medium">+{task.points}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0"
                        onClick={() => completeTask.mutate({ taskId: task.id })}
                        disabled={completeTask.isPending}
                      >
                        完成
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">暂无任务</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 兑换 */}
          <TabsContent value="rewards">
            <div className="space-y-4">
              {/* 创建奖品按钮（家长） */}
              {user?.role === "super_admin" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowCreateRewardDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加奖品
                </Button>
              )}

              {rewards && rewards.length > 0 ? (
                rewards.map((reward) => (
                  <Card key={reward.id} className="p-4 border-0 shadow-soft">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-pink-400 to-rose-500">
                        {reward.icon && (reward.icon.startsWith('http') || reward.icon.startsWith('/')) ? (
                          <img 
                            src={reward.icon} 
                            alt={reward.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl">{reward.icon || "🎁"}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold">{reward.name}</h4>
                        {reward.description && (
                          <p className="text-sm text-muted-foreground">{reward.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-amber-500">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-medium">{reward.pointsCost} 积分</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user?.role === "super_admin" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingReward(reward.id);
                                setNewRewardName(reward.name);
                                setNewRewardPoints(reward.pointsCost.toString());
                                setNewRewardIcon(reward.icon || "");
                                setNewRewardDescription(reward.description || "");
                                setShowCreateRewardDialog(true);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`确定要删除 ${reward.name} 吗？`)) {
                                  deleteReward.mutate({ id: reward.id });
                                }
                              }}
                              disabled={deleteReward.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                          onClick={() => {
                            if (confirm(`确定要兑换 ${reward.name} 吗？`)) {
                              redeemReward.mutate({ rewardId: reward.id });
                            }
                          }}
                          disabled={redeemReward.isPending || (pointsData?.points || 0) < reward.pointsCost}
                        >
                          兑换
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">暂无可兑换奖品</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 记录 */}
          <TabsContent value="history">
            <div className="space-y-3">
              {transactions && transactions.length > 0 ? (
                transactions.map((tx) => (
                  <Card key={tx.id} className="p-3 border-0 shadow-soft">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <span
                        className={`font-bold ${
                          tx.amount > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount}
                      </span>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">暂无积分记录</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* 创建任务弹窗 */}
      <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">任务名称</label>
              <Input
                placeholder="例如：完成今天的作业"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">积分奖励</label>
              <Input
                type="number"
                placeholder="10"
                value={newTaskPoints}
                onChange={(e) => setNewTaskPoints(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTaskDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0"
              onClick={() => {
                if (!newTaskTitle.trim()) {
                  toast.error("请输入任务名称");
                  return;
                }
                createTask.mutate({
                  title: newTaskTitle,
                  points: parseInt(newTaskPoints) || 10,
                });
              }}
              disabled={createTask.isPending}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建/编辑奖品弹窗 */}
      <Dialog open={showCreateRewardDialog} onOpenChange={(open) => {
        setShowCreateRewardDialog(open);
        if (!open) {
          setEditingReward(null);
          setNewRewardName("");
          setNewRewardPoints("100");
          setNewRewardIcon("");
          setNewRewardDescription("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReward ? "编辑奖品" : "添加奖品"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">奖品名称</label>
              <Input
                placeholder="例如：看一集动画片"
                value={newRewardName}
                onChange={(e) => setNewRewardName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">奖品图片</label>
              <p className="text-xs text-muted-foreground mb-2">选择图片后会自动上传，请稍候...</p>
              {newRewardIcon && (
                <div className="mb-3 p-2 border-2 border-green-500 rounded-lg bg-green-50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs font-medium text-green-700">图片上传成功！</span>
                  </div>
                  <img 
                    src={newRewardIcon} 
                    alt="奖品图片" 
                    className="w-32 h-32 object-cover rounded-lg border-2 border-white shadow-sm"
                  />
                </div>
              )}
              {uploadingIcon && (
                <div className="mb-3 p-4 border-2 border-blue-500 rounded-lg bg-blue-50 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium text-blue-700">正在上传图片...</span>
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // 检查文件大小（最大5MB）
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error("图片大小不能超过5MB");
                    return;
                  }
                  
                  setUploadingIcon(true);
                  try {
                    // 读取文件为ArrayBuffer
                    const arrayBuffer = await file.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    // 调用后端上传接口
                    const result = await uploadAvatar.mutateAsync({
                      filename: file.name,
                      contentType: file.type,
                      fileData: uint8Array,
                    });
                    
                    setNewRewardIcon(result.url);
                    toast.success("图片上传成功！");
                  } catch (error) {
                    console.error("上传失败:", error);
                    toast.error("图片上传失败，请重试");
                  } finally {
                    setUploadingIcon(false);
                  }
                }}
                disabled={uploadingIcon}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">描述（可选）</label>
              <Input
                placeholder="奖品描述"
                value={newRewardDescription}
                onChange={(e) => setNewRewardDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">所需积分</label>
              <Input
                type="number"
                placeholder="100"
                value={newRewardPoints}
                onChange={(e) => setNewRewardPoints(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateRewardDialog(false);
              setEditingReward(null);
              setNewRewardName("");
              setNewRewardPoints("100");
              setNewRewardIcon("");
              setNewRewardDescription("");
            }}>
              取消
            </Button>
            <Button
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
              onClick={() => {
                if (!newRewardName.trim()) {
                  toast.error("请输入奖品名称");
                  return;
                }
                if (editingReward) {
                  updateReward.mutate({
                    id: editingReward,
                    name: newRewardName,
                    icon: newRewardIcon || undefined,
                    description: newRewardDescription || undefined,
                    pointsCost: parseInt(newRewardPoints) || 100,
                  });
                } else {
                  createReward.mutate({
                    name: newRewardName,
                    icon: newRewardIcon || undefined,
                    description: newRewardDescription || undefined,
                    pointsCost: parseInt(newRewardPoints) || 100,
                  });
                }
              }}
              disabled={editingReward ? updateReward.isPending : createReward.isPending}
            >
              {editingReward ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
