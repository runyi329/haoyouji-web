/**
 * CustomAFManager.tsx - AF 型定制账本后台管理页面
 * 样式参照 CustomAEManager，红色主色风格
 * 功能：管理员创建 AF 账本、邀请成员
 * 注：AF 型功能待定，当前为 AE 型结构的副本，后续按需定制
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Star, ExternalLink } from "lucide-react";

export default function CustomAFManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteMap, setInviteMap] = useState<Record<number, string>>({});

  const utils = trpc.useUtils();

  const { data: afLedgers, isLoading } = trpc.ledger.listCustomAF.useQuery();

  const createMutation = trpc.ledger.createCustomAF.useMutation({
    onSuccess: () => {
      toast.success("AF 定制账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAF.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAF.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.message || "邀请成功，用户已加入账本");
      setInviteMap({});
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
    const username = inviteMap[ledgerId]?.trim();
    if (!username) {
      toast.error("请输入用户名");
      return;
    }
    inviteMutation.mutate({ ledgerId, username });
  };

  return (
    <div className="space-y-4">
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-[#D32F2F]" />
            <h2 className="font-bold text-base">定制账本 (AF) 管理</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建AF账本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          AF 型定制账本，仅管理员可创建，普通用户在新建账本列表中不可见，只有被邀请后才能进入。
        </p>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：2026 AF 定制账本"
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
      ) : !afLedgers || afLedgers.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无 AF 定制账本，点击上方「新建AF账本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {afLedgers.map((ledger: any) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-[#D32F2F] flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">{ledger.name}</p>
                    {ledger.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{ledger.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-[#D32F2F] font-medium">定制AF</span>
                      <span className="text-xs text-gray-400">
                        ID: {ledger.id} · 创建于 {new Date(ledger.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                  </div>
                </div>
                <a
                  href={`/ledger/${ledger.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#D32F2F] hover:text-red-700 flex items-center gap-0.5 flex-shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  进入
                </a>
              </div>

              {/* 邀请成员 */}
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">邀请成员加入此账本</p>
                <div className="flex gap-2">
                  <Input
                    value={inviteMap[ledger.id] ?? ""}
                    onChange={e => setInviteMap(prev => ({ ...prev, [ledger.id]: e.target.value }))}
                    placeholder="输入用户名..."
                    className="text-sm flex-1"
                    onKeyDown={e => e.key === "Enter" && handleInvite(ledger.id)}
                  />
                  <Button
                    size="sm"
                    className="bg-[#D32F2F] hover:bg-red-700 text-white"
                    onClick={() => handleInvite(ledger.id)}
                    disabled={inviteMutation.isPending}
                  >
                    邀请
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
