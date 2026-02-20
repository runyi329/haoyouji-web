import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Minus, Loader2, History, Users } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

const ACTION_TYPE_NAMES: Record<string, string> = {
  add_contact: "添加人脉",
  add_tag: "打标签",
  communication: "每次联络",
  share_contact: "共享人脉",
  be_referrer: "被加为推荐人",
  manual_adjust: "管理员调整",
};

interface PointRule {
  id: number;
  actionType: string;
  actionName: string;
  points: number;
  isActive: boolean;
  description?: string;
}

export default function PointsManagement() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; points: number } | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);

  // 历史记录筛选状态
  const [historySearchKeyword, setHistorySearchKeyword] = useState("");
  const [historyActionType, setHistoryActionType] = useState<string>("all");
  const [historyTimeRange, setHistoryTimeRange] = useState<string>("all");

  // 积分规则编辑状态
  const [editingRules, setEditingRules] = useState<Record<string, { points: number; isActive: boolean }>>({});

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

  // 获取所有积分记录
  const { data: allLogs, isLoading: isLoadingLogs } = trpc.pointSystem.getAllLogs.useQuery({
    page: 1,
    pageSize: 100,
  });

  // 获取所有积分规则
  const { data: pointRules, isLoading: isLoadingRules, refetch: refetchRules } = trpc.pointSystem.getAllRules.useQuery();

  // 初始化编辑状态
  useEffect(() => {
    if (pointRules) {
      const initialState: Record<string, { points: number; isActive: boolean }> = {};
      pointRules.forEach((rule: PointRule) => {
        initialState[rule.actionType] = {
          points: rule.points,
          isActive: rule.isActive,
        };
      });
      setEditingRules(initialState);
    }
  }, [pointRules]);

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

  // 更新积分规则
  const updateRuleMutation = trpc.pointSystem.updateRule.useMutation({
    onSuccess: () => {
      toast.success("积分规则更新成功");
      refetchRules();
    },
    onError: (error) => {
      toast.error(`更新失败：${error.message}`);
    },
  });

  const handleAdjust = () => {
    if (!selectedUser) return;
    const points = parseInt(adjustPoints);
    if (isNaN(points)) {
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

  const handleSaveRules = () => {
    if (!pointRules) return;

    // 批量更新所有规则
    const promises = pointRules.map((rule: PointRule) => {
      const editedRule = editingRules[rule.actionType];
      if (editedRule && (editedRule.points !== rule.points || editedRule.isActive !== rule.isActive)) {
        return updateRuleMutation.mutateAsync({
          actionType: rule.actionType,
          points: editedRule.points,
          isActive: editedRule.isActive,
        });
      }
      return Promise.resolve();
    });

    Promise.all(promises).then(() => {
      toast.success("所有积分规则已保存");
    }).catch((error) => {
      toast.error(`保存失败：${error.message}`);
    });
  };

  const handleRuleChange = (actionType: string, field: 'points' | 'isActive', value: number | boolean) => {
    setEditingRules(prev => ({
      ...prev,
      [actionType]: {
        ...prev[actionType],
        [field]: value,
      },
    }));
  };

  const displayUsers = searchKeyword ? searchResults : usersData?.users;

  // 筛选历史记录
  const filteredLogs = allLogs?.logs.filter((log) => {
    // 用户名筛选
    if (historySearchKeyword && !log.username.includes(historySearchKeyword)) {
      return false;
    }
    // 操作类型筛选
    if (historyActionType !== "all" && log.actionType !== historyActionType) {
      return false;
    }
    // 时间范围筛选
    if (historyTimeRange !== "all") {
      const logDate = new Date(log.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (historyTimeRange === "today" && diffDays > 0) return false;
      if (historyTimeRange === "week" && diffDays > 7) return false;
      if (historyTimeRange === "month" && diffDays > 30) return false;
    }
    return true;
  });

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">积分管理</h1>
        <p className="text-muted-foreground">管理用户积分和查看积分变动历史</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            用户管理
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            历史记录
          </TabsTrigger>
          <TabsTrigger value="coefficients" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            积分规则
          </TabsTrigger>
        </TabsList>

        {/* 用户管理标签页 */}
        <TabsContent value="users" className="mt-6">
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="搜索用户名..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading || isSearching ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4">
              {displayUsers?.map((user) => (
                <Card key={user.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{user.username}</h3>
                      <p className="text-sm text-muted-foreground">
                        当前积分：<span className="font-bold text-primary">{user.points}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedUser(user);
                          setAdjustPoints("10");
                          setShowAdjustDialog(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        增加
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedUser(user);
                          setAdjustPoints("-10");
                          setShowAdjustDialog(true);
                        }}
                      >
                        <Minus className="h-4 w-4 mr-1" />
                        减少
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 历史记录标签页 */}
        <TabsContent value="history" className="mt-6">
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="搜索用户名..."
                value={historySearchKeyword}
                onChange={(e) => setHistorySearchKeyword(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={historyActionType} onValueChange={setHistoryActionType}>
              <SelectTrigger>
                <SelectValue placeholder="操作类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="add_contact">添加人脉</SelectItem>
                <SelectItem value="add_tag">打标签</SelectItem>
                <SelectItem value="communication">每次联络</SelectItem>
                <SelectItem value="share_contact">共享人脉</SelectItem>
                <SelectItem value="be_referrer">被加为推荐人</SelectItem>
                <SelectItem value="manual_adjust">管理员调整</SelectItem>
              </SelectContent>
            </Select>

            <Select value={historyTimeRange} onValueChange={setHistoryTimeRange}>
              <SelectTrigger>
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="today">今天</SelectItem>
                <SelectItem value="week">本周</SelectItem>
                <SelectItem value="month">本月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoadingLogs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>操作类型</TableHead>
                    <TableHead className="text-right">积分变化</TableHead>
                    <TableHead className="text-right">当前积分</TableHead>
                    <TableHead>描述</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs && filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell className="font-medium">{log.username}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-[#F5F5F5] px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {ACTION_TYPE_NAMES[log.actionType] || log.actionType}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={log.points > 0 ? "text-[#4CAF50] font-semibold" : "text-[#D32F2F] font-semibold"}>
                            {log.points > 0 ? "+" : ""}{log.points}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{log.currentPoints}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {log.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        暂无记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* 积分规则标签页 */}
        <TabsContent value="coefficients" className="mt-6">
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">积分规则管理</h2>
              <p className="text-sm text-muted-foreground">
                调整不同行为的积分值和启用状态，修改后将影响所有用户的积分获取
              </p>
            </div>

            {isLoadingRules ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid gap-4">
                  {pointRules?.map((rule: PointRule) => (
                    <Card key={rule.actionType} className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg">{rule.actionName}</h3>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={editingRules[rule.actionType]?.isActive ?? rule.isActive}
                                onCheckedChange={(checked) => handleRuleChange(rule.actionType, 'isActive', checked)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {editingRules[rule.actionType]?.isActive ?? rule.isActive ? '已启用' : '已禁用'}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {rule.description || `用户${rule.actionName}时获得的积分`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={editingRules[rule.actionType]?.points ?? rule.points}
                            onChange={(e) => handleRuleChange(rule.actionType, 'points', parseInt(e.target.value) || 0)}
                            className="w-24 text-center"
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">积分</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => refetchRules()}>
                    重置
                  </Button>
                  <Button onClick={handleSaveRules} disabled={updateRuleMutation.isPending}>
                    {updateRuleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      "保存规则"
                    )}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* 调整积分对话框 */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>用户</Label>
              <p className="text-sm text-muted-foreground mt-1">{selectedUser?.username}</p>
              <p className="text-sm text-muted-foreground">
                当前积分：{selectedUser?.points}
              </p>
            </div>
            <div>
              <Label htmlFor="points">积分变化</Label>
              <Input
                id="points"
                type="number"
                placeholder="输入正数增加，负数减少"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="description">调整原因</Label>
              <Textarea
                id="description"
                placeholder="请输入调整原因..."
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                className="mt-2"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  调整中...
                </>
              ) : (
                "确认调整"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
