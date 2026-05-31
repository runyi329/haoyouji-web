/**
 * CustomAJManager.tsx - AJ 型定制账本后台管理页面
 * 业务报销系统
 * 功能：管理员创建 AJ 账本、邀请成员（可指定角色）
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, BookMarked, Users, ChevronDown, ChevronUp, ExternalLink, Receipt } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "member", label: "普通成员（提交报销）" },
  { value: "admin", label: "管理员（审批报销）" },
  { value: "observer", label: "观察者（只读查看）" },
];

export default function CustomAJManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);
  const [inviteMap, setInviteMap] = useState<Record<number, string>>({});
  const [roleMap, setRoleMap] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();

  const { data: ajLedgers, isLoading } = trpc.ledger.listCustomAJ.useQuery();

  const createMutation = trpc.ledger.createCustomAJ.useMutation({
    onSuccess: () => {
      toast.success("AJ 业务报销账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAJ.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAJ.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.message || "邀请成功，用户已加入账本");
      setInviteMap({});
      setRoleMap({});
    },
    onError: (e: any) => toast.error(e.message),
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
    const role = (roleMap[ledgerId] || "member") as any;
    inviteMutation.mutate({ ledgerId, username, role });
  };

  return (
    <div className="space-y-4">
      <PageTag code="P226" />
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#D32F2F]" />
            <h2 className="font-bold text-base">定制账本 (AJ) 管理</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建报销账本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          AJ 型业务报销账本，仅管理员可创建，支持员工提交报销、管理员审批，普通用户需被邀请才能进入。
        </p>
        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：2026年度业务报销"
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
      ) : !ajLedgers || ajLedgers.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无 AJ 报销账本，点击上方「新建报销账本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {ajLedgers.map((ledger) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#D32F2F]" />
                    <span className="font-medium">{ledger.name}</span>
                    <span className="text-xs bg-red-50 text-[#D32F2F] px-2 py-0.5 rounded-full">
                      业务报销AJ
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
                <div className="flex items-center gap-2">
                  <a
                    href={`/ledger/${ledger.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    onClick={() =>
                      setExpandedLedgerId(expandedLedgerId === ledger.id ? null : ledger.id)
                    }
                  >
                    <Users className="w-4 h-4" />
                    邀请用户
                    {expandedLedgerId === ledger.id ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
              {/* 邀请面板 */}
              {expandedLedgerId === ledger.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                  <p className="text-xs text-gray-500">
                    <Users className="w-3 h-3 inline mr-1" />
                    输入用户名邀请用户加入此报销账本（用户直接加入，无需主动申请）
                  </p>
                  <div className="space-y-2">
                    <Select
                      value={roleMap[ledger.id] || "member"}
                      onValueChange={(val) =>
                        setRoleMap((prev) => ({ ...prev, [ledger.id]: val }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择角色" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入用户名..."
                        value={inviteMap[ledger.id] || ""}
                        onChange={(e) =>
                          setInviteMap((prev) => ({ ...prev, [ledger.id]: e.target.value }))
                        }
                        className="flex-1 h-8 text-xs"
                        onKeyDown={(e) => e.key === "Enter" && handleInvite(ledger.id)}
                      />
                      <Button
                        size="sm"
                        className="bg-[#D32F2F] hover:bg-red-700 text-white h-8 text-xs"
                        onClick={() => handleInvite(ledger.id)}
                        disabled={inviteMutation.isPending}
                      >
                        {inviteMutation.isPending ? "邀请中..." : "邀请"}
                      </Button>
                    </div>
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
