import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Copy, Link, Users, Clock, Ban, CheckCircle, XCircle } from "lucide-react";

export function InvitationManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);

  const { data: invitations, refetch } = trpc.invitations.list.useQuery();
  const createMutation = trpc.invitations.create.useMutation({
    onSuccess: (data) => {
      setCreatedInviteCode(data.code);
      refetch();
      toast.success("邀请码创建成功");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deactivateMutation = trpc.invitations.deactivate.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("邀请码已停用");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      familyName: familyName || undefined,
      maxUses,
      expiresInDays,
    });
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/register?code=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("邀请链接已复制到剪贴板");
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("邀请码已复制到剪贴板");
  };

  const getStatusBadge = (invitation: {
    isActive: boolean;
    usedCount: number;
    maxUses: number;
    expiresAt: Date | null;
  }) => {
    if (!invitation.isActive) {
      return <Badge variant="secondary" className="gap-1"><Ban className="w-3 h-3" /> 已停用</Badge>;
    }
    if (invitation.usedCount >= invitation.maxUses) {
      return <Badge variant="secondary" className="gap-1"><CheckCircle className="w-3 h-3" /> 已用完</Badge>;
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> 已过期</Badge>;
    }
    return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="w-3 h-3" /> 有效</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">邀请家长</h3>
          <p className="text-sm text-muted-foreground">
            创建邀请码，发送给家长注册账户
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              创建邀请码
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建邀请码</DialogTitle>
              <DialogDescription>
                创建一个邀请码，家长可以通过邀请链接注册账户
              </DialogDescription>
            </DialogHeader>
            
            {createdInviteCode ? (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-600 dark:text-green-400 mb-2">邀请码创建成功！</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-white dark:bg-gray-800 rounded font-mono text-lg">
                      {createdInviteCode}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => handleCopyCode(createdInviteCode)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>邀请链接</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      readOnly 
                      value={`${window.location.origin}/register?code=${createdInviteCode}`}
                      className="font-mono text-sm"
                    />
                    <Button variant="outline" size="sm" onClick={() => handleCopyLink(createdInviteCode)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => {
                    setCreatedInviteCode(null);
                    setFamilyName("");
                    setMaxUses(1);
                    setExpiresInDays(7);
                    setIsCreateDialogOpen(false);
                  }}>
                    完成
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="familyName">家庭名称（可选）</Label>
                    <Input
                      id="familyName"
                      placeholder="如：张家、李家"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      预设家庭名称，家长注册时会自动创建该名称的家庭
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxUses">可使用次数</Label>
                      <Input
                        id="maxUses"
                        type="number"
                        min={1}
                        max={100}
                        value={maxUses}
                        onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiresInDays">有效天数</Label>
                      <Input
                        id="expiresInDays"
                        type="number"
                        min={1}
                        max={365}
                        value={expiresInDays}
                        onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 7)}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "创建中..." : "创建"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 邀请码列表 */}
      <div className="space-y-4">
        {invitations?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>还没有创建邀请码</p>
              <p className="text-sm">点击上方按钮创建第一个邀请码</p>
            </CardContent>
          </Card>
        )}
        
        {invitations?.map((invitation) => (
          <Card key={invitation.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <code className="px-2 py-1 bg-muted rounded font-mono text-lg">
                    {invitation.code}
                  </code>
                  {getStatusBadge(invitation)}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleCopyCode(invitation.code)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleCopyLink(invitation.code)}
                  >
                    <Link className="w-4 h-4" />
                  </Button>
                  {invitation.isActive && invitation.usedCount < invitation.maxUses && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deactivateMutation.mutate({ id: invitation.id })}
                    >
                      <Ban className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                {invitation.familyName && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {invitation.familyName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  使用: {invitation.usedCount}/{invitation.maxUses}
                </span>
                {invitation.expiresAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(invitation.expiresAt) < new Date() 
                      ? "已过期" 
                      : `${Math.ceil((new Date(invitation.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}天后过期`
                    }
                  </span>
                )}
                <span className="text-xs">
                  创建于 {new Date(invitation.createdAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
