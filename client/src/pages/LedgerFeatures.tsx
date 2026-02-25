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
    if (!enabled) {
      // 关闭报销功能时，后端会检查是否还有待报销的账目
      updateFeaturesMutation.mutate({
        ledgerId,
        enableReimbursement: enabled,
      }, {
        onError: (error) => {
          toast.error(error.message || "无法关闭报销功能");
          refetch();
        },
      });
    } else {
      updateFeaturesMutation.mutate({
        ledgerId,
        enableReimbursement: enabled,
      });
    }
  };

  const handleTogglePending = (enabled: boolean) => {
    if (!enabled) {
      // 关闭待结功能时，后端会检查是否还有未结算的账目
      updateFeaturesMutation.mutate({
        ledgerId,
        enablePending: enabled,
      }, {
        onError: (error) => {
          toast.error(error.message || "无法关闭待结功能");
          refetch();
        },
      });
    } else {
      updateFeaturesMutation.mutate({
        ledgerId,
        enablePending: enabled,
      });
    }
  };

  const handleTogglePendingDefaultStats = (includeStats: number) => {
    updateFeaturesMutation.mutate({
      ledgerId,
      pendingDefaultIncludeStats: includeStats,
    });
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
  const pendingDefaultIncludeStats = (ledger as any).pendingDefaultIncludeStats ?? 1;

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
          {/* 第一层：开关 */}
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
            <>
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

              {/* 第二层：默认统计模式 */}
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-800 mb-3">待结账目默认统计模式</p>
                <div className="space-y-2">
                  <label 
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      pendingDefaultIncludeStats === 1 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'bg-white border border-gray-100 hover:bg-gray-50'
                    }`}
                    onClick={() => handleTogglePendingDefaultStats(1)}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      pendingDefaultIncludeStats === 1 ? 'border-blue-500' : 'border-gray-300'
                    }`}>
                      {pendingDefaultIncludeStats === 1 && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">显示并计入统计</p>
                      <p className="text-xs text-gray-500 mt-0.5">待结账目会显示在列表中，同时计入收支统计</p>
                    </div>
                  </label>
                  <label 
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      pendingDefaultIncludeStats === 0 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'bg-white border border-gray-100 hover:bg-gray-50'
                    }`}
                    onClick={() => handleTogglePendingDefaultStats(0)}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      pendingDefaultIncludeStats === 0 ? 'border-blue-500' : 'border-gray-300'
                    }`}>
                      {pendingDefaultIncludeStats === 0 && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">仅显示不计入统计</p>
                      <p className="text-xs text-gray-500 mt-0.5">待结账目会显示在列表中，但不计入收支统计，金额显示为灰色</p>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-2">此设置为添加账目时的默认选项，添加时仍可单独调整</p>
              </div>
            </>
          )}
        </div>

        {/* 说明 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 mb-2">💡 功能说明</h4>
          <div className="space-y-2 text-sm text-yellow-800">
            <p>• 关闭功能后，相关按钮会在添加账单页面隐藏</p>
            <p>• 如有未处理的待结或待报销账目，需先处理后才能关闭对应功能</p>
            <p>• 已标记的历史记录不受影响，仍然保留标记</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LedgerFeatures;
