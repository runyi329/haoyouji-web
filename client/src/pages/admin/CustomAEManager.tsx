/**
 * CustomAEManager.tsx - AE 型定制账本（共享抽奖）后台管理页面
 * 功能：管理员创建 AE 账本、邀请成员（组织者）
 * 抽奖活动的创建和管理在账本内部前端页面完成，此处不涉及
 * 样式参照 CustomADManager
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, UserPlus, ChevronDown, ChevronUp, Trophy, ExternalLink } from "lucide-react";

export default function CustomAEManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: aeLedgers, isLoading } = trpc.ledger.listCustomAE.useQuery();

  const createMutation = trpc.ledger.createCustomAE.useMutation({
    onSuccess: () => {
      toast.success("AE 共享抽奖账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAE.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAE.useMutation({
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
      {/* 说明 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
        <strong>AE 型 · 共享抽奖</strong>：在此创建账本并邀请组织者加入。
        组织者进入账本后，可在账本内部创建和管理抽奖活动（即时自助、定时开奖、阶段解锁三种模式）。
        参与者通过组织者分享的邀请链接进入参与抽奖。
      </div>

      {/* 新建按钮 */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          新建抽奖账本
        </Button>
      </div>

      {/* 新建表单 */}
      {showCreate && (
        <Card className="p-4 space-y-3 border-amber-200">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-600" />
            <span className="font-medium text-sm text-gray-700">新建 AE 型共享抽奖账本</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">账本名称 *</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="如：2025年终抽奖、团建大抽奖..."
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
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
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
      ) : !aeLedgers || aeLedgers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无 AE 型共享抽奖账本</p>
          <p className="text-xs mt-1">点击「新建抽奖账本」创建第一个</p>
        </div>
      ) : (
        <div className="space-y-3">
          {aeLedgers.map((ledger: any) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">{ledger.name}</p>
                    {ledger.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{ledger.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">定制AE</span>
                      <span className="text-xs text-gray-400">#{ledger.id}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(ledger.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      <a
                        href={`/lottery/list/${ledger.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        进入账本
                      </a>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedLedgerId(expandedLedgerId === ledger.id ? null : ledger.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  {expandedLedgerId === ledger.id
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* 邀请成员 */}
              {expandedLedgerId === ledger.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    邀请组织者加入此账本
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
                      className="bg-amber-600 hover:bg-amber-700 text-white"
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
