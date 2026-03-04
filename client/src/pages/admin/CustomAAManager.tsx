import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Users, BookMarked, UserPlus, ChevronDown, ChevronUp } from "lucide-react";

export default function CustomAAManager() {
  // 创建账本
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // 邀请用户
  const [inviteUsername, setInviteUsername] = useState("");
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: aaLedgers, isLoading } = trpc.ledger.listCustomAA.useQuery();

  const createMutation = trpc.ledger.createCustomAA.useMutation({
    onSuccess: () => {
      toast.success("定制账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAA.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAA.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.message || "邀请成功，用户已加入账本");
      setInviteUsername("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("请填写账本名称");
      return;
    }
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined });
  };

  const handleInvite = (ledgerId: number) => {
    if (!inviteUsername.trim()) {
      toast.error("请填写用户名");
      return;
    }
    inviteMutation.mutate({ ledgerId, username: inviteUsername.trim() });
  };

  return (
    <div className="space-y-4">
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-[#D32F2F]" />
            <h2 className="font-bold text-base">定制账本 (AA) 管理</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建定制账本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          定制账本仅管理员可创建，普通用户在新建账本列表中不可见，只有被邀请后才能进入。
        </p>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：VIP定制AA账本"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">备注说明（选填）</Label>
              <Input
                placeholder="账本用途说明..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-[#D32F2F] hover:bg-red-700 text-white"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "创建中..." : "确认创建"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 账本列表 */}
      {isLoading ? (
        <Card className="p-6 text-center text-gray-400 text-sm">加载中...</Card>
      ) : !aaLedgers || aaLedgers.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无定制账本，点击上方「新建定制账本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {aaLedgers.map((ledger) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-[#D32F2F]" />
                    <span className="font-medium">{ledger.name}</span>
                    <span className="text-xs bg-red-50 text-[#D32F2F] px-2 py-0.5 rounded-full">
                      定制AA
                    </span>
                  </div>
                  {ledger.description && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">{ledger.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 ml-6">
                    ID: {ledger.id} · 创建于{" "}
                    {new Date(ledger.createdAt!).toLocaleDateString("zh-CN")}
                  </p>
                </div>
                <button
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  onClick={() =>
                    setExpandedLedgerId(expandedLedgerId === ledger.id ? null : ledger.id)
                  }
                >
                  <UserPlus className="w-4 h-4" />
                  邀请用户
                  {expandedLedgerId === ledger.id ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* 邀请面板 */}
              {expandedLedgerId === ledger.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">
                    <Users className="w-3 h-3 inline mr-1" />
                    输入用户名邀请用户加入此定制账本（用户不需要主动申请，直接加入）
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入用户名..."
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleInvite(ledger.id)}
                    />
                    <Button
                      size="sm"
                      className="bg-[#D32F2F] hover:bg-red-700 text-white"
                      onClick={() => handleInvite(ledger.id)}
                      disabled={inviteMutation.isPending}
                    >
                      {inviteMutation.isPending ? "邀请中..." : "邀请"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
