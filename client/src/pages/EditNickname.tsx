import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function EditNickname() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

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
          <h1 className="text-lg font-medium text-gray-900">修改我的昵称</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="bg-white mt-3 p-4">
        <div className="space-y-2">
          <label className="text-sm text-gray-600">我在账本的昵称</label>
          <Input
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            placeholder="请输入昵称"
            className="text-base"
            maxLength={10}
          />
          <div className="text-xs text-gray-400 text-right">
            {newNickname.length}/10
          </div>
          <div className="text-xs text-gray-500 mt-2">
            昵称将显示在账本成员列表和交易记录中
          </div>
        </div>
      </div>

      {/* 底部确定按钮 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
        <Button
          onClick={handleSave}
          disabled={updateNicknameMutation.isPending || !newNickname.trim()}
          className="w-full bg-[#ff7f50] hover:bg-[#ff6a3d] text-white"
        >
          {updateNicknameMutation.isPending ? "保存中..." : "确定"}
        </Button>
      </div>
    </div>
  );
}
