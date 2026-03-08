/**
 * CustomADManager.tsx - AD 型定制账本（永忆）管理页面
 * 样式参照 CustomAAManager / CustomABManager / CustomACManager
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, UserPlus, ChevronDown, ChevronUp, StickyNote } from "lucide-react";

function DiamondIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 9 18 22 6 22 2 9 12 2" fill="#D32F2F" stroke="#D32F2F" />
      <polyline points="2 9 12 15 22 9" stroke="white" strokeWidth="1.5" />
      <line x1="12" y1="2" x2="12" y2="15" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

export default function CustomADManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: adLedgers, isLoading } = trpc.ledger.listCustomAD.useQuery();

  const createMutation = trpc.ledger.createCustomAD.useMutation({
    onSuccess: () => {
      toast.success("AD 定制账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAD.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAD.useMutation({
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
      toast.error("请输入用户名");
      return;
    }
    inviteMutation.mutate({ ledgerId, username: inviteUsername.trim() });
  };

  return (
    <div className="space-y-4">
      {/* 新建按钮 */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white flex items-center gap-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          新建备忘录账本
        </Button>
      </div>

      {/* 新建表单 */}
      {showCreate && (
        <Card className="p-4 space-y-3 border-[#D32F2F]/20">
          <div className="flex items-center gap-2">
            <DiamondIcon className="w-5 h-5" />
            <span className="font-medium text-sm text-gray-700">新建 AD 型备忘录账本</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">账本名称 *</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="如：永忆、私人密码本..."
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">描述（可选）</Label>
            <Input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="账本用途说明..."
              className="text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowCreate(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "创建中..." : "确认创建"}
            </Button>
          </div>
        </Card>
      )}

      {/* 账本列表 */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : !adLedgers || adLedgers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无 AD 型备忘录账本</p>
          <p className="text-xs mt-1">点击「新建备忘录账本」创建第一个</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adLedgers.map((ledger: any) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <DiamondIcon className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">{ledger.name}</p>
                    {ledger.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{ledger.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">定制AD</span>
                      <span className="text-xs text-gray-400">#{ledger.id}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(ledger.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedLedgerId(expandedLedgerId === ledger.id ? null : ledger.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  {expandedLedgerId === ledger.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* 邀请成员 */}
              {expandedLedgerId === ledger.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    邀请用户加入此账本
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={inviteUsername}
                      onChange={e => setInviteUsername(e.target.value)}
                      placeholder="输入用户名..."
                      className="text-sm flex-1"
                      onKeyDown={e => e.key === "Enter" && handleInvite(ledger.id)}
                    />
                    <Button
                      size="sm"
                      className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                      onClick={() => handleInvite(ledger.id)}
                      disabled={inviteMutation.isPending}
                    >
                      邀请
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
