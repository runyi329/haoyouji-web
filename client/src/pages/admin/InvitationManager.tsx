import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Copy, Link2, Users, CheckCircle, XCircle, Share, RefreshCw, Edit, UserPlus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // 获取所有用户的邀请权限状态
  const { data: allUsers, refetch, isLoading } = trpc.invitePermission.getAllUsersInvitePermission.useQuery();

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
    if (user.id === editReferrerDialog.userId) return false; // 不能选择自己
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
    const link = `https://jiangyuchen.cn/register?invite=${code}`;
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
    // 查找当前推荐人
    const currentReferrer = allUsers?.find(u => u.id === user.invitedByUserId);
    
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

  // 获取用户的推荐人信息
  const getUserReferrer = (userId: number) => {
    return allUsers?.find(u => u.id === userId);
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
      {/* 页面标题和说明 */}
      <div>
        <h3 className="text-lg font-semibold">用户邀请权限管理</h3>
        <p className="text-sm text-muted-foreground">
          管理用户的邀请功能权限,控制哪些用户可以邀请新用户注册,并可手动修改推荐关系
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总用户数</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已开启</p>
                <p className="text-2xl font-bold text-[#4CAF50]">{stats.enabled}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-[#4CAF50]" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已关闭</p>
                <p className="text-2xl font-bold text-gray-400">{stats.disabled}</p>
              </div>
              <XCircle className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">累计邀请</p>
                <p className="text-2xl font-bold text-[#1976D2]">{stats.totalInvites}</p>
              </div>
              <Share className="w-8 h-8 text-[#1976D2]" />
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
          
          return (
            <Card 
              key={user.id}
              className={`transition-all ${selectedUserId === user.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedUserId(user.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  {/* 用户信息 */}
                  <div className="flex-1 min-w-0">
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
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>@{user.username}</span>
                      {user.inviteCode && (
                        <span className="font-mono">{user.inviteCode}</span>
                      )}
                      <span>已邀请: {user.inviteCount}人</span>
                      {referrer && (
                        <span className="text-[#D32F2F]">
                          推荐人: {referrer.name || referrer.username}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 编辑推荐人 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditReferrer(user);
                      }}
                      title="编辑推荐人"
                    >
                      <UserPlus className="w-4 h-4" />
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
                    >
                      <Copy className="w-4 h-4" />
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
                    >
                      <Link2 className="w-4 h-4" />
                    </Button>

                    {/* 权限开关 */}
                    <div className="flex items-center gap-2 pl-2 border-l">
                      <Label htmlFor={`switch-${user.id}`} className="text-xs cursor-pointer">
                        {user.inviteEnabled ? '开启' : '关闭'}
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
                              value={`https://jiangyuchen.cn/register?invite=${user.inviteCode}`}
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
