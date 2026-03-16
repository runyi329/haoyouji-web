/**
 * CustomAHManager.tsx - AH 型定制账本后台管理页面
 * 公司财务记账管理，支持5层角色
 * 功能：管理员创建 AH 账本、邀请成员（可指定角色）
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Star, ExternalLink, Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "admin", label: "管理员（代理记账公司）" },
  { value: "member", label: "普通用户（发工资的员工）" },
  { value: "client", label: "客户（企业客户）" },
  { value: "employee", label: "企业员工（申报）" },
];

export default function CustomAHManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteMap, setInviteMap] = useState<Record<number, string>>({});
  const [roleMap, setRoleMap] = useState<Record<number, string>>({});

  const utils = trpc.useUtils();

  const { data: ahLedgers, isLoading } = trpc.ledger.listCustomAH.useQuery();

  const createMutation = trpc.ledger.createCustomAH.useMutation({
    onSuccess: () => {
      toast.success("AH 财务记账账本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.ledger.listCustomAH.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const inviteMutation = trpc.ledger.inviteToCustomAH.useMutation({
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
    const role = roleMap[ledgerId] || "member";
    inviteMutation.mutate({ ledgerId, username, role });
  };

  return (
    <div className="space-y-4">
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#1A56DB]" />
            <h2 className="font-bold text-base">财务记账管理 (AH) </h2>
          </div>
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-blue-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建AH账本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          AH 型定制账本，用于公司财务记账管理。支持5层角色：创建者、管理员、普通用户、客户、企业员工。
        </p>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：XX公司 2026年度财务"
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
                className="bg-[#1A56DB] hover:bg-blue-700 text-white"
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

      {/* 角色说明 */}
      <Card className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">角色权限说明</h3>
        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#1A56DB' }} />
            <span><strong>创建者</strong> — 代理集团公司老板，最高权限（创建账本时自动分配）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#3B82F6' }} />
            <span><strong>管理员</strong> — 代理记账公司，管理层权限</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#60A5FA' }} />
            <span><strong>普通用户</strong> — 发工资的员工，操作层权限</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#93C5FD' }} />
            <span><strong>客户</strong> — 企业客户，查看层权限</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#BFDBFE' }} />
            <span><strong>企业员工</strong> — 企业员工，申报层权限</span>
          </div>
        </div>
      </Card>

      {/* 账本列表 */}
      {isLoading ? (
        <Card className="p-6 text-center text-gray-400 text-sm">加载中...</Card>
      ) : !ahLedgers || ahLedgers.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无 AH 财务记账账本，点击上方「新建AH账本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {ahLedgers.map((ledger: any) => (
            <Card key={ledger.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-[#1A56DB] flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">{ledger.name}</p>
                    {ledger.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{ledger.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-[#1A56DB] font-medium">财务AH</span>
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
                  className="text-xs text-[#1A56DB] hover:text-blue-700 flex items-center gap-0.5 flex-shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  进入
                </a>
              </div>

              {/* 邀请成员（可选角色） */}
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">邀请成员加入此账本（可指定角色）</p>
                <div className="flex gap-2">
                  <Input
                    value={inviteMap[ledger.id] ?? ""}
                    onChange={e => setInviteMap(prev => ({ ...prev, [ledger.id]: e.target.value }))}
                    placeholder="输入用户名..."
                    className="text-sm flex-1"
                    onKeyDown={e => e.key === "Enter" && handleInvite(ledger.id)}
                  />
                  <Select
                    value={roleMap[ledger.id] || "member"}
                    onValueChange={val => setRoleMap(prev => ({ ...prev, [ledger.id]: val }))}
                  >
                    <SelectTrigger className="w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="bg-[#1A56DB] hover:bg-blue-700 text-white"
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
