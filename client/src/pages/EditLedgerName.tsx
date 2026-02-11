import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function EditLedgerName() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  const [newName, setNewName] = useState("");
  const isInitialized = useRef(false);

  // 初始化名称（仅在首次加载时）
  useEffect(() => {
    if (ledgerData?.name && !isInitialized.current) {
      setNewName(ledgerData.name);
      isInitialized.current = true;
    }
  }, [ledgerData?.name]);

  // 更新账本名称的mutation
  const utils = trpc.useUtils();
  const updateLedgerNameMutation = trpc.ledger.update.useMutation({
    onSuccess: () => {
      toast.success("账本名称已更新");
      utils.ledger.getById.invalidate({ ledgerId });
      utils.ledger.list.invalidate();
      // 返回设置页面
      setLocation(`/ledger/${ledgerId}/settings`);
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 保存名称
  const handleSave = () => {
    if (!newName.trim()) {
      toast.error("账本名称不能为空");
      return;
    }
    updateLedgerNameMutation.mutate({
      ledgerId,
      name: newName.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">修改账本名称</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="bg-white mt-3 p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-gray-600">账本名称</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="请输入账本名称"
              className="text-base"
              maxLength={20}
            />
            <div className="text-xs text-gray-400 text-right">
              {newName.length}/20
            </div>
          </div>
          
          {/* 确定按钮 */}
          <Button
            onClick={handleSave}
            disabled={updateLedgerNameMutation.isPending || !newName.trim()}
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: themeColors.primary }}
          >
            {updateLedgerNameMutation.isPending ? "保存中..." : "确定"}
          </Button>
        </div>
      </div>
    </div>
  );
}
