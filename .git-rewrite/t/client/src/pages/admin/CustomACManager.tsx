/**
 * CustomACManager.tsx - AC 型定制账本（共享健康·减肥账本）管理页面
 * 样式参照 CustomAAManager / CustomABManager，简洁列表展示
 * 账本模式：多学员体重/三围/卡路里打卡，教练管理学员档案
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, UserPlus, ChevronDown, ChevronUp, Users } from "lucide-react";

// 钻石图标 SVG
function DiamondIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 9 18 22 6 22 2 9 12 2" fill="#D32F2F" stroke="#D32F2F" />
      <polyline points="2 9 12 15 22 9" stroke="white" strokeWidth="1.5" />
      <line x1="12" y1="2" x2="12" y2="15" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

export default function CustomACManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: acLedgers, isLoading } = trpc.ledger.listCustomAC.useQuery();

  const createMutation = trpc.ledger.createCustomAC.useMutation({
    onSuccess: () => {
      toast.success("AC 定制账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAC.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAC.useMutation({
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
            <DiamondIcon className="w-5 h-5" />
            <h2 className="font-bold text-base">定制账本 (AC) 管理</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建减肥账本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          共享健康·减肥账本：多学员体重/三围/卡路里打卡，教练统一管理学员档案与进度。仅管理员可创建，普通用户需被邀请后进入。
        </p>
        {/* 账本模式说明 */}
        <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
          <p className="text-xs font-semibold text-[#D32F2F] mb-1.5">📋 账本记录模式</p>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
            <span>⚖️ 体重打卡（斤/kg）</span>
            <span>📏 胸围/cm</span>
            <span>📐 腰围/cm</span>
            <span>🍑 臀围/cm</span>
            <span>🔥 卡路里消耗/kcal</span>
            <span>🍱 三餐照片+AI分析</span>
          </div>
        </div>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：共享健康-共享减肥2026"
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
      ) : !acLedgers || acLedgers.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无 AC 定制账本，点击上方「新建减肥账本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {acLedgers.map((ledger: any) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => (window.location.href = `/ledger/${ledger.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <DiamondIcon className="w-4 h-4" />
                    <span className="font-medium">{ledger.name}</span>
                    <span className="text-xs bg-red-50 text-[#D32F2F] px-2 py-0.5 rounded-full">
                      定制AC
                    </span>
                  </div>
                  {ledger.description && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">{ledger.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 ml-6">
                    ID: {ledger.id} · 创建于{" "}
                    {ledger.createdAt
                      ? new Date(ledger.createdAt).toLocaleDateString("zh-CN")
                      : "未知"}
                    {ledger.memberCount != null && ` · ${ledger.memberCount} 名学员`}
                  </p>
                </div>
                <button
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 ml-2 flex-shrink-0"
                  onClick={() =>
                    setExpandedLedgerId(expandedLedgerId === ledger.id ? null : ledger.id)
                  }
                >
                  <UserPlus className="w-4 h-4" />
                  邀请学员
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
                    输入用户名邀请学员加入此减肥账本（直接加入，无需申请）
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
