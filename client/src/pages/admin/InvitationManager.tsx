import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Copy, Link2, Users, CheckCircle, XCircle, Share, RefreshCw, Edit, UserPlus, X, Layers } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageTag } from "@/components/PageTag";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function InvitationManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // 编辑推荐人对话框
  const [editReferrerDialog, setEditReferrerDialog] = useState<{
    open: boolean;
    userId: number | null;
    userName: string;
    currentReferrerId: number | null;
  }>({
    open: false,
    userId: null,
    userName: "",
    currentReferrerId: null,
  });

  const [referrerSearchQuery, setReferrerSearchQuery] = useState("");
  const [selectedReferrerId, setSelectedReferrerId] = useState<number | null>(null);

  // 版本设置对话框
  const [versionDialog, setVersionDialog] = useState<{
    open: boolean;
    userId: number | null;
    userName: string;
    versionKey: string;
    switchEnabled: boolean;
    switchScope: string[];
    // 影响范围：self=仅本人 / new=本人+今后新下线 / old=本人+已注册老下线 / both=本人+新老下线
    applyScope: "self" | "new" | "old" | "both";
  }>({
    open: false,
    userId: null,
    userName: "",
    versionKey: "",
    switchEnabled: false,
    switchScope: [],
    applyScope: "self",
  });

  // 获取所有用户的邀请权限状态
  const { data: allUsers, refetch, isLoading } = trpc.invitePermission.getAllUsersInvitePermission.useQuery();

  // 获取版本列表（含禁用，管理员后台用）
  const { data: versions } = trpc.version.listVersions.useQuery({ includeDisabled: true });

  // 切换邀请权限
  const togglePermissionMutation = trpc.invitePermission.setUserInvitePermission.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 更新推荐人
  const updateReferrerMutation = trpc.invitePermission.updateUserReferrer.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
      setReferrerSearchQuery("");
      setSelectedReferrerId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 设置用户版本
  const setUserVersionMutation = trpc.version.setUserVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`版本设置已保存（影响 ${data.affected} 个用户）`);
      setVersionDialog((prev) => ({ ...prev, open: false }));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 版本key -> 名称映射
  const versionNameMap: Record<string, string> = {};
  (versions || []).forEach((v) => {
    versionNameMap[v.versionKey] = v.name;
  });

  // 搜索过滤
  const filteredUsers = allUsers?.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.inviteCode?.toLowerCase().includes(query)
    );
  });

  // 推荐人候选列表(排除自己)
  const referrerCandidates = allUsers?.filter(user => {
    if (user.id === editReferrerDialog.userId) return false;
    if (!referrerSearchQuery) return true;
    const query = referrerSearchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.inviteCode?.toLowerCase().includes(query)
    );
  });

  // 复制邀请码
  const handleCopyCode = (code: string | null) => {
    if (!code) {
      toast.error("该用户还没有邀请码");
      return;
    }
    navigator.clipboard.writeText(code);
    toast.success("邀请码已复制");
  };

  // 复制邀请链接
  const handleCopyLink = (code: string | null) => {
    if (!code) {
      toast.error("该用户还没有邀请码");
      return;
    }
    const link = `https://jiangyuchen.cn/login?invite=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("邀请链接已复制");
  };

  // 切换权限
  const handleTogglePermission = (userId: number, currentEnabled: boolean) => {
    togglePermissionMutation.mutate({
      userId,
      enabled: !currentEnabled,
    });
  };

  // 打开编辑推荐人对话框
  const handleOpenEditReferrer = (user: any) => {
    setEditReferrerDialog({
      open: true,
      userId: user.id,
      userName: user.name || user.username,
      currentReferrerId: user.invitedByUserId || null,
    });
    setSelectedReferrerId(user.invitedByUserId || null);
    setReferrerSearchQuery("");
  };

  // 保存推荐人
  const handleSaveReferrer = () => {
    if (!editReferrerDialog.userId) return;
    updateReferrerMutation.mutate({
      userId: editReferrerDialog.userId,
      referrerId: selectedReferrerId,
    });
  };

  // 打开版本设置对话框
  const handleOpenVersionDialog = (user: any) => {
    setVersionDialog({
      open: true,
      userId: user.id,
      userName: user.name || user.username,
      versionKey: user.versionKey || "",
      switchEnabled: Boolean(user.versionSwitchEnabled),
      switchScope: Array.isArray(user.versionSwitchScope) ? user.versionSwitchScope : [],
      applyScope: "self",
    });
  };

  // 保存版本设置
  const handleSaveVersion = () => {
    if (!versionDialog.userId) return;
    setUserVersionMutation.mutate({
      userId: versionDialog.userId,
      versionKey: versionDialog.versionKey,
      switchEnabled: versionDialog.switchEnabled,
      switchScope: versionDialog.switchScope,
      applyScope: versionDialog.applyScope,
    });
  };

  // 切换可切换范围中的某个版本
  const toggleScopeVersion = (versionKey: string) => {
    setVersionDialog((prev) => {
      const exists = prev.switchScope.includes(versionKey);
      return {
        ...prev,
        switchScope: exists
          ? prev.switchScope.filter((k) => k !== versionKey)
          : [...prev.switchScope, versionKey],
      };
    });
  };

  // 获取用户的推荐人信息
  const getUserReferrer = (userId: number) => {
    return allUsers?.find(u => u.id === userId);
  };

  // 计算某用户的「生效版本 + 来源」（与后端一致：自身设置优先，否则沿链追溯最顶层设置者）
  const resolveUserVersionLabel = (user: any): { key: string; name: string; sourceText: string } | null => {
    if (!allUsers || allUsers.length === 0) return null;
    const byId = new Map<number, any>();
    allUsers.forEach((u) => byId.set(u.id, u));

    // 1. 用户自己被明确设置过版本 → 以自己为准（本人设定，不被上线覆盖）
    if (user.versionKey && String(user.versionKey).trim()) {
      const selfKey = String(user.versionKey).trim();
      return { key: selfKey, name: versionNameMap[selfKey] || selfKey, sourceText: "本人设定" };
    }

    // 2. 自己未设置（继承上线）→ 沿推荐链向上，记录最顶层设置过 versionKey 的祖先
    let cur: any = user;
    let depth = 0;
    let topSetter: any = null;
    const visited = new Set<number>();
    while (cur && depth < 50) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (cur.versionKey && String(cur.versionKey).trim()) {
        topSetter = cur;
      }
      const parentId = cur.invitedByUserId;
      cur = parentId ? byId.get(parentId) : null;
      depth++;
    }

    if (!topSetter) {
      return { key: "maidong", name: versionNameMap["maidong"] || "脉动版", sourceText: "默认" };
    }
    const key = String(topSetter.versionKey).trim();
    const name = versionNameMap[key] || key;
    return { key, name, sourceText: `继承自 ${topSetter.name || topSetter.username}` };
  };

  // 统计信息
  const stats = {
    total: allUsers?.length || 0,
    enabled: allUsers?.filter(u => u.inviteEnabled).length || 0,
    disabled: allUsers?.filter(u => !u.inviteEnabled).length || 0,
    totalInvites: allUsers?.reduce((sum, u) => sum + u.inviteCount, 0) || 0,
  };

  return (
    <div className="space-y-6">
      <PageTag code="P230" />
      {/* 页面标题和说明 */}
      <div>
        <h3 className="text-lg font-semibold">用户邀请权限管理</h3>
        <p className="text-sm text-muted-foreground">
          管理用户的邀请功能权限,控制哪些用户可以邀请新用户注册,可手动修改推荐关系,并为用户设置进入的版本与切换权限
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[11px] leading-tight text-muted-foreground truncate">总用户数</p>
                <p className="text-lg font-bold leading-tight">{stats.total}</p>
              </div>
              <Users className="w-4 h-4 shrink-0 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[11px] leading-tight text-muted-foreground truncate">已开启</p>
                <p className="text-lg font-bold leading-tight text-[#4CAF50]">{stats.enabled}</p>
              </div>
              <CheckCircle className="w-4 h-4 shrink-0 text-[#4CAF50]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[11px] leading-tight text-muted-foreground truncate">已关闭</p>
                <p className="text-lg font-bold leading-tight text-gray-400">{stats.disabled}</p>
              </div>
              <XCircle className="w-4 h-4 shrink-0 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[11px] leading-tight text-muted-foreground truncate">累计邀请</p>
                <p className="text-lg font-bold leading-tight text-[#1976D2]">{stats.totalInvites}</p>
              </div>
              <Share className="w-4 h-4 shrink-0 text-[#1976D2]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和批量操作 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索用户名、昵称或邀请码..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 用户列表 */}
      <div className="space-y-2">
        {isLoading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p>加载中...</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredUsers?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>没有找到匹配的用户</p>
              {searchQuery && (
                <p className="text-sm">尝试修改搜索关键词</p>
              )}
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredUsers?.map((user) => {
          const referrer = getUserReferrer(user.invitedByUserId || 0);
          const versionLabel = resolveUserVersionLabel(user);

          return (
            <Card
              key={user.id}
              className={`transition-all ${selectedUserId === user.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedUserId(user.id)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  {/* 用户信息 */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium truncate">
                        {user.name || user.username}
                      </span>
                      {user.role === 'super_admin' && (
                        <Badge variant="secondary" className="text-xs">管理员</Badge>
                      )}
                      {user.inviteEnabled ? (
                        <Badge variant="default" className="text-xs bg-[#4CAF50]">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          已开启
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <XCircle className="w-3 h-3 mr-1" />
                          已关闭
                        </Badge>
                      )}
                      {/* 生效版本徽标 */}
                      {versionLabel && (
                        <Badge variant="outline" className="text-xs border-[#1976D2] text-[#1976D2]">
                          <Layers className="w-3 h-3 mr-1" />
                          {versionLabel.name}
                        </Badge>
                      )}
                      {user.versionSwitchEnabled && (
                        <Badge variant="outline" className="text-xs border-[#4CAF50] text-[#4CAF50]">
                          可切换
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
                      <span className="whitespace-nowrap">@{user.username}</span>
                      {user.inviteCode && (
                        <span className="font-mono whitespace-nowrap">{user.inviteCode}</span>
                      )}
                      <span className="whitespace-nowrap">已邀请 {user.inviteCount} 人</span>
                      {referrer && (
                        <span className="text-[#D32F2F] whitespace-nowrap">
                          推荐人：{referrer.name || referrer.username}
                        </span>
                      )}
                      {versionLabel && (
                        <span className="text-[#1976D2] whitespace-nowrap">
                          版本来源：{versionLabel.sourceText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-wrap pt-2 border-t">
                    {/* 设置版本 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenVersionDialog(user);
                      }}
                      title="设置版本"
                      className="px-2"
                    >
                      <Layers className="w-4 h-4 mr-1" />
                      <span className="text-xs">版本</span>
                    </Button>

                    {/* 编辑推荐人 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditReferrer(user);
                      }}
                      title="编辑推荐人"
                      className="px-2"
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      <span className="text-xs">推荐人</span>
                    </Button>

                    {/* 复制邀请码 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(user.inviteCode);
                      }}
                      disabled={!user.inviteCode}
                      title="复制邀请码"
                      className="px-2"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      <span className="text-xs">邀请码</span>
                    </Button>

                    {/* 复制邀请链接 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(user.inviteCode);
                      }}
                      disabled={!user.inviteCode}
                      title="复制邀请链接"
                      className="px-2"
                    >
                      <Link2 className="w-4 h-4 mr-1" />
                      <span className="text-xs">链接</span>
                    </Button>

                    {/* 权限开关 */}
                    <div className="flex items-center gap-2 ml-auto pl-2">
                      <Label htmlFor={`switch-${user.id}`} className="text-xs cursor-pointer text-muted-foreground">
                        {user.inviteEnabled ? '邀请开' : '邀请关'}
                      </Label>
                      <Switch
                        id={`switch-${user.id}`}
                        checked={user.inviteEnabled}
                        onCheckedChange={() => handleTogglePermission(user.id, user.inviteEnabled)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </div>

                {/* 展开详情 */}
                {selectedUserId === user.id && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    {/* 版本信息 */}
                    {versionLabel && (
                      <div className="p-3 bg-[#E3F2FD] rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">进入版本</p>
                            <p className="font-medium text-[#1976D2]">{versionLabel.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              来源: {versionLabel.sourceText}
                              {user.versionSwitchEnabled ? " · 允许右上角切换" : " · 锁定该版本"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenVersionDialog(user);
                            }}
                          >
                            <Layers className="w-4 h-4 mr-1" />
                            设置版本
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 推荐人信息 */}
                    {referrer && (
                      <div className="p-3 bg-[#FFEBEE] rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">推荐人</p>
                            <p className="font-medium">{referrer.name || referrer.username}</p>
                            <p className="text-xs text-muted-foreground">@{referrer.username}</p>
                            {referrer.inviteCode && (
                              <p className="text-xs font-mono text-[#D32F2F] mt-1">
                                邀请码: {referrer.inviteCode}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditReferrer(user);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            修改
                          </Button>
                        </div>
                      </div>
                    )}

                    {!referrer && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">暂无推荐人</p>
                            <p className="text-xs text-muted-foreground">可以手动设置推荐关系</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditReferrer(user);
                            }}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            添加
                          </Button>
                        </div>
                      </div>
                    )}

                    {user.inviteCode && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">邀请码</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              readOnly
                              value={user.inviteCode}
                              className="font-mono"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyCode(user.inviteCode)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">邀请链接</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              readOnly
                              value={`https://jiangyuchen.cn/login?invite=${user.inviteCode}`}
                              className="font-mono text-xs"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyLink(user.inviteCode)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">邀请统计</span>
                      <span className="font-medium">已邀请 {user.inviteCount} 人</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 显示结果数量 */}
      {!isLoading && filteredUsers && filteredUsers.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          显示 {filteredUsers.length} / {allUsers?.length} 个用户
        </p>
      )}

      {/* 版本设置对话框 */}
      <Dialog open={versionDialog.open} onOpenChange={(open) => {
        if (!open) setVersionDialog((prev) => ({ ...prev, open: false }));
      }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">设置版本 - {versionDialog.userName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* 该用户的版本 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">该用户的版本</Label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                选「继承上线」表示不单独设置，沿推荐链向上由最顶层设置者决定；选定某版本则只影响该用户本人。
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {/* 继承上线选项 */}
                <button
                  type="button"
                  className={`w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                    !versionDialog.versionKey ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setVersionDialog((prev) => ({ ...prev, versionKey: "" }))}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">继承上线（不单独设置）</p>
                    <p className="text-[11px] text-muted-foreground">沿推荐链向上由最顶层设置者决定</p>
                  </div>
                  {!versionDialog.versionKey && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                </button>

                {(versions || []).map((v) => (
                  <button
                    key={v.versionKey}
                    type="button"
                    className={`w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                      versionDialog.versionKey === v.versionKey ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setVersionDialog((prev) => ({ ...prev, versionKey: v.versionKey }))}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {v.name}
                        {!v.enabled && <span className="ml-1.5 text-[11px] text-gray-400">(已停用)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{v.versionKey} · 落地 {v.landingPath}</p>
                    </div>
                    {versionDialog.versionKey === v.versionKey && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 允许切换 + 可切换范围（合并：开启后下方直接展开勾选） */}
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">允许切换版本</p>
                  <p className="text-[11px] text-muted-foreground">开启后用户可在自己版本内切换到下列勾选的版本</p>
                </div>
                <Switch
                  checked={versionDialog.switchEnabled}
                  onCheckedChange={(checked) =>
                    setVersionDialog((prev) => ({ ...prev, switchEnabled: checked }))
                  }
                />
              </div>

              {versionDialog.switchEnabled && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[11px] text-muted-foreground mb-1.5">勾选允许切换到的版本；不勾选则表示允许切换到全部已启用版本。</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(versions || []).filter((v) => v.enabled).map((v) => {
                      const checked = versionDialog.switchScope.includes(v.versionKey);
                      return (
                        <button
                          key={v.versionKey}
                          type="button"
                          onClick={() => toggleScopeVersion(v.versionKey)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-sm transition-all ${
                            checked ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          {checked ? <CheckCircle className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />}
                          <span className="truncate">{v.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 影响范围（四选一单选） */}
            <div className="rounded-lg bg-[#FFF3E0] px-3 py-2">
              <p className="text-sm font-medium">影响范围</p>
              <p className="text-[11px] text-muted-foreground mb-1.5">该版本设置应用到哪些用户。下线指其推荐链下的人。</p>
              <div className="grid grid-cols-1 gap-1.5">
                {([
                  { key: "self", title: "仅本人", desc: "只改该用户自己，不动任何下线" },
                  { key: "new", title: "本人 + 今后新下线", desc: "老下线不动；今后新注册且选继承的下线自动跟随" },
                  { key: "old", title: "本人 + 已注册老下线", desc: "把现有下线一次性强制改为该版本" },
                  { key: "both", title: "本人 + 新老下线", desc: "既改写现有下线，新下线也继承跟随" },
                ] as const).map((opt) => {
                  const active = versionDialog.applyScope === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVersionDialog((prev) => ({ ...prev, applyScope: opt.key }))}
                      className={`w-full text-left rounded-md border px-2.5 py-1.5 flex items-center justify-between transition-all ${
                        active ? 'border-[#E65100] bg-white' : 'border-transparent bg-white/50 hover:bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{opt.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</p>
                      </div>
                      {active
                        ? <CheckCircle className="w-4 h-4 text-[#E65100] shrink-0" />
                        : <span className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersionDialog((prev) => ({ ...prev, open: false }))}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSaveVersion}
              disabled={setUserVersionMutation.isPending}
            >
              {setUserVersionMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑推荐人对话框 */}
      <Dialog open={editReferrerDialog.open} onOpenChange={(open) => {
        if (!open) {
          setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
          setReferrerSearchQuery("");
          setSelectedReferrerId(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑推荐人 - {editReferrerDialog.userName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 当前推荐人 */}
            {editReferrerDialog.currentReferrerId && (
              <div className="p-3 bg-[#FFEBEE] rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">当前推荐人</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {getUserReferrer(editReferrerDialog.currentReferrerId)?.name ||
                       getUserReferrer(editReferrerDialog.currentReferrerId)?.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{getUserReferrer(editReferrerDialog.currentReferrerId)?.username}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedReferrerId(null)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    清除
                  </Button>
                </div>
              </div>
            )}

            {/* 搜索推荐人 */}
            <div className="space-y-2">
              <Label>选择新推荐人</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名、昵称或邀请码..."
                  value={referrerSearchQuery}
                  onChange={(e) => setReferrerSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* 推荐人候选列表 */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {referrerCandidates?.map((candidate) => (
                <Card
                  key={candidate.id}
                  className={`cursor-pointer transition-all ${
                    selectedReferrerId === candidate.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedReferrerId(candidate.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{candidate.name || candidate.username}</span>
                          {candidate.role === 'super_admin' && (
                            <Badge variant="secondary" className="text-xs">管理员</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>@{candidate.username}</span>
                          {candidate.inviteCode && (
                            <span className="font-mono">{candidate.inviteCode}</span>
                          )}
                          <span>已邀请: {candidate.inviteCount}人</span>
                        </div>
                      </div>
                      {selectedReferrerId === candidate.id && (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {referrerCandidates?.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>没有找到匹配的用户</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
                setReferrerSearchQuery("");
                setSelectedReferrerId(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveReferrer}
              disabled={updateReferrerMutation.isPending || selectedReferrerId === editReferrerDialog.currentReferrerId}
            >
              {updateReferrerMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
