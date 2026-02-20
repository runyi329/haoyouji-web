import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function EditNickname() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  // 获取账本成员列表
  const { data: members, isLoading } = trpc.ledger.getMembers.useQuery({ ledgerId });

  const [newNickname, setNewNickname] = useState("");

  // 初始化昵称
  useEffect(() => {
    if (members && members.length > 0 && !newNickname) {
      setNewNickname(members[0]?.nickname || "");
    }
  }, [members, newNickname]);

  // 更新昵称的mutation
  const utils = trpc.useUtils();
  const updateNicknameMutation = trpc.ledger.updateMemberNickname.useMutation({
    onSuccess: () => {
      toast.success("昵称已更新");
      utils.ledger.getMembers.invalidate({ ledgerId });
      // 返回设置页面
      setLocation(`/ledger/${ledgerId}/settings`);
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 保存昵称
  const handleSave = () => {
    if (!newNickname.trim()) {
      toast.error("昵称不能为空");
      return;
    }
    updateNicknameMutation.mutate({
      ledgerId,
      nickname: newNickname.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-[#757575]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-[#424242]" />
          </button>
          <h1 className="text-lg font-medium text-[#424242]">修改我的昵称</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="bg-white mt-3 p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-[#757575]">我的昵称</label>
            <Input
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="请输入昵称"
              className="text-base"
              maxLength={10}
            />
            <div className="text-xs text-[#757575] text-right">
              {newNickname.length}/10
            </div>
            <p className="text-xs text-[#757575]">
              昵称将显示在账本成员列表和交易记录中
            </p>
          </div>
          
          {/* 确定按钮 */}
          <Button
            onClick={handleSave}
            disabled={updateNicknameMutation.isPending || !newNickname.trim()}
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: themeColors.primary }}
          >
            {updateNicknameMutation.isPending ? "保存中..." : "确定"}
          </Button>
        </div>
      </div>
    </div>
  );
}
