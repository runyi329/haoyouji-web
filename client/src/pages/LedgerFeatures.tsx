import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";

const LedgerFeatures = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id!);

  // 获取账本信息
  const { data: ledger, refetch } = trpc.ledger.getLedger.useQuery({ id: ledgerId });

  // 更新账本功能设置
  const updateFeaturesMutation = trpc.ledger.updateLedgerFeatures.useMutation({
    onSuccess: () => {
      toast.success("功能设置已更新");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  const handleToggleReimbursement = (enabled: boolean) => {
    updateFeaturesMutation.mutate({
      ledgerId,
      enableReimbursement: enabled,
    });
  };

  const handleTogglePending = (enabled: boolean) => {
    if (!enabled) {
      // 关闭待结功能时，后端会检查是否还有未结算的账目
      // 如果有，会抛出错误，前端显示提示
      updateFeaturesMutation.mutate({
        ledgerId,
        enablePending: enabled,
      }, {
        onError: (error) => {
          toast.error(error.message || "无法关闭待结功能");
          refetch(); // 重新加载以恢复开关状态
        },
      });
    } else {
      updateFeaturesMutation.mutate({
        ledgerId,
        enablePending: enabled,
      });
    }
  };

  if (!ledger) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const enableReimbursement = ledger.enableReimbursement === 1;
  const enablePending = ledger.enablePending === 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white p-4 flex items-center justify-between border-b sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">账本功能管理</h1>
        <div className="w-5" />
      </div>

      {/* 功能列表 */}
      <div className="p-4 space-y-3">
        {/* 报销功能 */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-medium text-gray-900">报销功能</h3>
              <p className="text-sm text-gray-500 mt-1">
                开启后，在添加账单时可以标记为报销项目
              </p>
            </div>
            <Switch
              checked={enableReimbursement}
              onCheckedChange={handleToggleReimbursement}
              disabled={updateFeaturesMutation.isPending}
            />
          </div>
          {enableReimbursement && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                ✓ 报销功能已启用，添加账单时会显示"报销"按钮
              </p>
            </div>
          )}
        </div>

        {/* 待结功能 */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-medium text-gray-900">待结功能</h3>
              <p className="text-sm text-gray-500 mt-1">
                开启后，在添加账单时可以标记为代收或代付
              </p>
            </div>
            <Switch
              checked={enablePending}
              onCheckedChange={handleTogglePending}
              disabled={updateFeaturesMutation.isPending}
            />
          </div>
          {enablePending && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-green-800 mb-2">
                ✓ 待结功能已启用，添加账单时会显示"代收"和"代付"按钮
              </p>
              <div className="space-y-1 text-xs text-green-700">
                <p>• <strong>代收</strong>：标记为代他人收款的项目</p>
                <p>• <strong>代付</strong>：标记为代他人付款的项目</p>
                <p className="flex items-center gap-1">• 标记后的项目会在列表中显示 <Hourglass className="w-3.5 h-3.5 text-blue-600 inline" /> 沙漏图标</p>
              </div>
            </div>
          )}
        </div>

        {/* 说明 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 mb-2">💡 功能说明</h4>
          <div className="space-y-2 text-sm text-yellow-800">
            <p>• 关闭功能后，相关按钮会在添加账单页面隐藏</p>
            <p>• 已标记的历史记录不受影响，仍然保留标记</p>
            <p>• 可以随时开启或关闭功能</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LedgerFeatures;
