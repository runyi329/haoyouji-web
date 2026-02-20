import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface ApprovalRule {
  recorderId: number | null;
  approverType: 'all' | 'specific';
  approverIds: number[];
}

export default function LedgerApprovalSettings() {
  const [, params] = useRoute("/ledger/:id/approval-settings");
  const [, setLocation] = useLocation();
  // toast from sonner
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // 获取账本成员
  const { data: members = [] } = trpc.ledger.getMembers.useQuery({ ledgerId });
  
  // 获取现有审批规则
  const { data: existingRules = [] } = trpc.ledger.getApprovalRules.useQuery({ ledgerId });

  // 保存审批规则
  const saveRulesMutation = trpc.ledger.saveApprovalRules.useMutation({
    onSuccess: () => {
      toast.success("审批设置已更新");
      setLocation(`/ledger/${ledgerId}`);
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  // 审批规则状态
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  // 初始化规则
  useEffect(() => {
    if (existingRules.length > 0) {
      const formattedRules = existingRules.map((rule: any) => ({
        recorderId: rule.recorderId,
        approverType: rule.approverType,
        approverIds: rule.approverIds ? JSON.parse(rule.approverIds) : [],
      }));
      setRules(formattedRules);
    } else {
      // 默认规则：全体成员需要全部成员审批
      setRules([
        {
          recorderId: null,
          approverType: 'all',
          approverIds: [],
        },
      ]);
    }
  }, [existingRules]);

  // 添加特殊设置
  const addSpecialRule = () => {
    // 找到第一个还没有特殊设置的成员
    const usedRecorderIds = rules
      .filter(r => r.recorderId !== null)
      .map(r => r.recorderId);
    
    const availableMember = members.find(
      m => !usedRecorderIds.includes(m.userId)
    );

    if (!availableMember) {
      toast.error("所有成员都已设置特殊规则");
      return;
    }

    setRules([
      ...rules,
      {
        recorderId: availableMember.userId,
        approverType: 'all',
        approverIds: [],
      },
    ]);
  };

  // 删除特殊设置
  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  // 更新规则
  const updateRule = (index: number, updates: Partial<ApprovalRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
  };

  // 切换审批人选择
  const toggleApprover = (ruleIndex: number, userId: number) => {
    const rule = rules[ruleIndex];
    const approverIds = rule.approverIds || [];
    
    if (approverIds.includes(userId)) {
      updateRule(ruleIndex, {
        approverIds: approverIds.filter(id => id !== userId),
      });
    } else {
      updateRule(ruleIndex, {
        approverIds: [...approverIds, userId],
      });
    }
  };

  // 保存设置
  const handleSave = () => {
    saveRulesMutation.mutate({
      ledgerId,
      rules,
    });
  };

  // 获取成员信息
  const getMemberInfo = (userId: number) => {
    return members.find(m => m.userId === userId);
  };

  // 渲染审批人选择器
  const renderApproverSelector = (rule: ApprovalRule, ruleIndex: number) => {
    if (rule.approverType === 'all') {
      return (
        <div className="text-center text-[#757575] py-4">
          需全部成员审批
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {members.map((member) => {
          const isSelected = rule.approverIds?.includes(member.userId);
          return (
            <div
              key={member.userId}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
              onClick={() => toggleApprover(ruleIndex, member.userId)}
            >
              <Checkbox checked={isSelected} />
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.avatar || undefined} />
                <AvatarFallback className="text-xs">
                  {member.nickname?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{member.nickname || '未命名'}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 to-blue-600">
      {/* 顶部导航 */}
      <div className="bg-[#1976D2] text-white p-4 flex items-center">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="mr-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-medium">账目审批设置</h1>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        {/* 说明文字 */}
        <Card className="bg-[#FAF3ED] border-[#FFA726] p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-[#CBA471] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-[#FFA726] leading-relaxed">
                开启审批人之后，记账人添加新的账目需要所属全部审批人审批之后才会入账。账目在未审批之前不会统计到系统
                {showMoreInfo && (
                  <>
                    的收支金额内！针对成员的特殊设置会覆盖全员设置！
                  </>
                )}
              </p>
              <button
                onClick={() => setShowMoreInfo(!showMoreInfo)}
                className="text-[#1976D2] text-sm mt-1 underline"
              >
                {showMoreInfo ? '收起' : '更多介绍'}
              </button>
            </div>
          </div>
        </Card>

        {/* 规则列表 */}
        <Card className="bg-white p-4 mb-4">
          {/* 表头 */}
          <div className="grid grid-cols-2 gap-4 mb-4 pb-3 border-b">
            <div className="text-center font-medium text-[#424242]">记账人</div>
            <div className="text-center font-medium text-[#424242]">审批人</div>
          </div>

          {/* 规则行 */}
          {rules.map((rule, index) => (
            <div key={index} className="mb-4 last:mb-0">
              <div className="grid grid-cols-2 gap-4">
                {/* 左列：记账人 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  {rule.recorderId === null ? (
                    <div className="text-center">
                      <div className="text-sm text-[#757575]">全部&新加入成员</div>
                      <div className="text-xs text-[#757575] mt-1">(除特殊设置外)</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {index > 0 && (
                        <button
                          onClick={() => removeRule(index)}
                          className="text-[#D32F2F] hover:text-[#D32F2F]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={getMemberInfo(rule.recorderId)?.avatar || undefined} />
                        <AvatarFallback>
                          {getMemberInfo(rule.recorderId)?.nickname?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {getMemberInfo(rule.recorderId)?.nickname || '未命名'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 右列：审批人 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <Select
                    value={rule.approverType}
                    onValueChange={(value: 'all' | 'specific') => {
                      updateRule(index, { approverType: value, approverIds: [] });
                    }}
                  >
                    <SelectTrigger className="mb-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">需全部成员审批</SelectItem>
                      <SelectItem value="specific">指定审批人</SelectItem>
                    </SelectContent>
                  </Select>

                  {rule.approverType === 'specific' && (
                    <div className="mt-2">
                      {renderApproverSelector(rule, index)}
                    </div>
                  )}

                  {rule.approverType === 'all' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {members.map((member) => (
                        <Avatar key={member.userId} className="h-8 w-8">
                          <AvatarImage src={member.avatar || undefined} />
                          <AvatarFallback className="text-xs">
                            {member.nickname?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 添加特殊设置按钮 */}
          <button
            onClick={addSpecialRule}
            className="w-full mt-4 py-3 text-[#757575] text-sm flex items-center justify-center gap-2 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            添加特殊设置
          </button>
        </Card>

        {/* 保存按钮 */}
        <Button
          onClick={handleSave}
          disabled={saveRulesMutation.isPending}
          className="w-full bg-[#1976D2] hover:bg-[#1976D2] text-white py-6 text-base rounded-lg"
        >
          {saveRulesMutation.isPending ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </div>
  );
}
