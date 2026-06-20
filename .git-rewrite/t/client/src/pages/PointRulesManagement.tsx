import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Settings } from "lucide-react";

const ACTION_TYPE_NAMES: Record<string, string> = {
  add_contact: "添加人脉",
  add_tag: "打标签",
  communication: "每次联络",
  share_contact: "共享人脉",
  be_referrer: "被加为推荐人",
};

export default function PointRulesManagement() {

  const [editingRules, setEditingRules] = useState<Record<number, { points: number; isActive: boolean }>>({});

  // 获取所有积分规则
  const { data: rules, isLoading, refetch } = trpc.pointSystem.getAllRules.useQuery();

  // 更新积分规则
  const updateRuleMutation = trpc.pointSystem.updateRule.useMutation({
    onSuccess: () => {
      toast.success("积分规则已更新");
      refetch();
      setEditingRules({});
    },
    onError: (error) => {
      toast.error(`保存失败：${error.message}`);
    },
  });

  const handlePointsChange = (ruleId: number, points: string) => {
    const numPoints = parseInt(points);
    if (!isNaN(numPoints) && numPoints >= 0) {
      setEditingRules(prev => ({
        ...prev,
        [ruleId]: {
          ...prev[ruleId],
          points: numPoints,
        },
      }));
    }
  };

  const handleActiveChange = (ruleId: number, isActive: boolean) => {
    setEditingRules(prev => ({
      ...prev,
      [ruleId]: {
        ...prev[ruleId],
        isActive,
      },
    }));
  };

  const handleSave = (ruleId: number) => {
    const editedRule = editingRules[ruleId];
    if (editedRule) {
      updateRuleMutation.mutate({
        ruleId,
        points: editedRule.points,
        isActive: editedRule.isActive,
      });
    }
  };

  const handleSaveAll = () => {
    Object.entries(editingRules).forEach(([ruleId, rule]) => {
      updateRuleMutation.mutate({
        ruleId: parseInt(ruleId),
        points: rule.points,
        isActive: rule.isActive,
      });
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">积分规则管理</h1>
        </div>
        <p className="text-muted-foreground">
          配置各项操作的积分奖励值和启用状态
        </p>
      </div>

      <div className="space-y-4">
        {rules?.map((rule) => {
          const editedRule = editingRules[rule.id];
          const currentPoints = editedRule?.points ?? rule.points;
          const currentIsActive = editedRule?.isActive ?? rule.isActive;
          const hasChanges = editedRule !== undefined;

          return (
            <Card key={rule.id} className={hasChanges ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{ACTION_TYPE_NAMES[rule.actionType] || rule.actionType}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${rule.id}`} className="text-sm font-normal">
                      {currentIsActive ? "已启用" : "已禁用"}
                    </Label>
                    <Switch
                      id={`active-${rule.id}`}
                      checked={currentIsActive}
                      onCheckedChange={(checked) => handleActiveChange(rule.id, checked)}
                    />
                  </div>
                </CardTitle>
                <CardDescription>
                  用户执行此操作时获得的积分奖励
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor={`points-${rule.id}`}>积分值</Label>
                    <Input
                      id={`points-${rule.id}`}
                      type="number"
                      min="0"
                      value={currentPoints}
                      onChange={(e) => handlePointsChange(rule.id, e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  {hasChanges && (
                    <Button
                      onClick={() => handleSave(rule.id)}
                      disabled={updateRuleMutation.isPending}
                    >
                      {updateRuleMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          保存
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {Object.keys(editingRules).length > 1 && (
        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            onClick={handleSaveAll}
            disabled={updateRuleMutation.isPending}
          >
            {updateRuleMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                保存所有更改
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
