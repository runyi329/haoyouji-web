import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Users,
  BookOpen,
  Gift,
  ListTodo,
  Plus,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Upload,
  BookMarked,
  Star,
  Camera,
  Sparkles,
  Share,
  Coins,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AntonymManager from "./admin/AntonymManager";
import CharacterManager from "./admin/CharacterManager";
import GameRewardManager from "./admin/GameRewardManager";
import { InvitationManager } from "./admin/InvitationManager";
import VocabularyMasterManager from "./admin/VocabularyMasterManager";
import AccountRelationshipManager from "./admin/AccountRelationshipManager";
import MasterLibraryManager from "./admin/MasterLibraryManager";
import UserPermissionsManager from "./admin/UserPermissionsManager";
import PointsManagement from "./admin/PointsManagement";
import DataSecurityPanel from "./admin/DataSecurityPanel";

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState<number | null>(null);
  
  // 创建用户表单
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "parent" | "baby">("parent");
  
  // 重置密码
  const [resetPassword, setResetPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // 编辑用户
  const [showEditUser, setShowEditUser] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editName, setEditName] = useState("");
  
  // 删除用户
  const [showDeleteUser, setShowDeleteUser] = useState<number | null>(null);

  const { data: users, refetch: refetchUsers } = trpc.admin.getUsers.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });

  const createUserMutation = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("用户创建成功！");
      setShowCreateUser(false);
      setNewUsername("");
      setNewPassword("");
      setNewName("");
      setNewRole("parent");
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const unlockUserMutation = trpc.admin.unlockUser.useMutation({
    onSuccess: () => {
      toast.success("用户已解锁");
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("角色已更新");
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetPasswordMutation = trpc.admin.resetUserPassword.useMutation({
    onSuccess: () => {
      toast.success("密码已重置");
      setShowResetPassword(null);
      setResetPassword("");
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const updateUserMutation = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("用户信息已更新");
      setShowEditUser(null);
      setEditUsername("");
      setEditName("");
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const deleteUsersMutation = trpc.admin.deleteUsers.useMutation({
    onSuccess: () => {
      toast.success("用户已删除");
      setShowDeleteUser(null);
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 邀请功能权限控制
  const toggleInvitePermissionMutation = trpc.invitePermission.setUserInvitePermission.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchUsers();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!user || user.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-muted-foreground mb-4">只有管理员可以访问后台管理</p>
          <Link href="/">
            <Button>返回首页</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      toast.error("请填写用户名和密码");
      return;
    }
    createUserMutation.mutate({
      username: newUsername,
      password: newPassword,
      name: newName || undefined,
      role: newRole,
    });
  };

  const handleResetPassword = (userId: number) => {
    if (!resetPassword || resetPassword.length < 6) {
      toast.error("密码长度至少6个字符");
      return;
    }
    resetPasswordMutation.mutate({
      userId,
      newPassword: resetPassword,
    });
  };
  
  const handleEditUser = (userId: number) => {
    if (!editUsername || editUsername.length < 3) {
      toast.error("用户名长度至少3个字符");
      return;
    }
    updateUserMutation.mutate({
      userId,
      username: editUsername,
      name: editName || undefined,
    });
  };
  
  const handleDeleteUser = (userId: number) => {
    deleteUsersMutation.mutate({
      userIds: [userId],
    });
  };







  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">后台管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#A80000]" />
            <span className="text-sm font-medium">{user.name || user.username}</span>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="flex flex-wrap w-full gap-2 mb-6 h-auto">

            <TabsTrigger value="users" className="text-xs sm:text-sm">
              <Users className="w-4 h-4 mr-1 hidden sm:inline" />
              用户
            </TabsTrigger>
            <TabsTrigger value="invitations" className="text-xs sm:text-sm">
              <Plus className="w-4 h-4 mr-1 hidden sm:inline" />
              邀请
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="text-xs sm:text-sm">
              <BookOpen className="w-4 h-4 mr-1 hidden sm:inline" />
              知识
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs sm:text-sm">
              <ListTodo className="w-4 h-4 mr-1 hidden sm:inline" />
              任务
            </TabsTrigger>
            <TabsTrigger value="points" className="text-xs sm:text-sm">
              <Gift className="w-4 h-4 mr-1 hidden sm:inline" />
              积分
            </TabsTrigger>

            <TabsTrigger value="masterLibrary" className="text-xs sm:text-sm">
              <BookOpen className="w-4 h-4 mr-1 hidden sm:inline" />
              总库
            </TabsTrigger>
            <TabsTrigger value="gameReward" className="text-xs sm:text-sm">
              <Star className="w-4 h-4 mr-1 hidden sm:inline" />
              奖励配置
            </TabsTrigger>

            <TabsTrigger value="accountRelationship" className="text-xs sm:text-sm">
              <Users className="w-4 h-4 mr-1 hidden sm:inline" />
              账户关系
            </TabsTrigger>
            <TabsTrigger value="permissions" className="text-xs sm:text-sm">
              <Shield className="w-4 h-4 mr-1 hidden sm:inline" />
              功能权限
            </TabsTrigger>
            <TabsTrigger value="aiManagement" className="text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 mr-1 hidden sm:inline" />
              AI管理
            </TabsTrigger>
            <TabsTrigger value="dataSecurity" className="text-xs sm:text-sm">
              <Lock className="w-4 h-4 mr-1 hidden sm:inline" />
              数据安全
            </TabsTrigger>
            <TabsTrigger value="equity" className="text-xs sm:text-sm">
              <Coins className="w-4 h-4 mr-1 hidden sm:inline" />
              股权管理
            </TabsTrigger>
          </TabsList>



          {/* 用户管理 */}
          <TabsContent value="users">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">用户管理</h2>
                <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-[#A80000] hover:bg-[#8a0000] text-white border-0">
                      <Plus className="w-4 h-4 mr-1" />
                      创建用户
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>创建新用户</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="space-y-2">
                        <Label>用户名</Label>
                        <Input
                          placeholder="3-20个字符"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>昵称（可选）</Label>
                        <Input
                          placeholder="显示名称"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>密码</Label>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="至少6个字符"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>角色</Label>
                        <Select value={newRole} onValueChange={(v) => setNewRole(v as "super_admin" | "parent" | "baby")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">超级管理员</SelectItem>
                            <SelectItem value="parent">家长</SelectItem>
                            <SelectItem value="baby">宝宝</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-[#A80000] hover:bg-[#8a0000] text-white border-0"
                        disabled={createUserMutation.isPending}
                      >
                        {createUserMutation.isPending ? "创建中..." : "创建用户"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* 首页横幅配置 */}
              <div className="mb-4 p-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-amber-900">首页横幅配置</h3>
                    <p className="text-sm text-amber-700 mt-1">设置首页顶部显示的横幅内容（标题、描述、图片）</p>
                  </div>
                  <Link href="/admin/banner">
                    <Button variant="outline" className="bg-white">
                      <Camera className="w-4 h-4 mr-2" />
                      配置横幅
                    </Button>
                  </Link>
                </div>
              </div>

              {/* 用户列表 */}
              <div className="space-y-3">
                {users?.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{u.name || u.username}</span>
                        {u.role === "super_admin" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-[#A80000]">
                            超级管理员
                          </span>
                        )}
                        {u.role === "parent" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                            家长
                          </span>
                        )}
                        {u.role === "baby" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-pink-100 text-pink-600">
                            宝宝
                          </span>
                        )}
                        {u.isLocked && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">
                            已锁定
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        @{u.username} · {u.points} 积分
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {u.isLocked && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          onClick={() => unlockUserMutation.mutate({ userId: u.id })}
                        >
                          <Unlock className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8"
                        onClick={() => {
                          setRoleMutation.mutate({
                            userId: u.id,
                            role: u.role === "super_admin" ? "parent" : "super_admin",
                          });
                        }}
                      >
                        {u.role === "super_admin" ? (
                          <Shield className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                      </Button>
                      
                      {/* 邀请功能开关 */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`w-8 h-8 ${
                          u.inviteEnabled 
                            ? 'text-green-600 hover:text-green-700' 
                            : 'text-gray-400 hover:text-gray-500'
                        }`}
                        onClick={() => {
                          toggleInvitePermissionMutation.mutate({
                            userId: u.id,
                            enabled: !u.inviteEnabled,
                          });
                        }}
                        title={u.inviteEnabled ? '关闭邀请功能' : '开启邀请功能'}
                      >
                        <Share className="w-4 h-4" />
                      </Button>
                      
                      {/* 编辑用户 */}
                      <Dialog
                        open={showEditUser === u.id}
                        onOpenChange={(open) => {
                          setShowEditUser(open ? u.id : null);
                          if (open) {
                            setEditUsername(u.username);
                            setEditName(u.name || "");
                          } else {
                            setEditUsername("");
                            setEditName("");
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="w-8 h-8">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>编辑用户 - {u.name || u.username}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>用户名</Label>
                              <Input
                                placeholder="3-20个字符"
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>昵称（可选）</Label>
                              <Input
                                placeholder="显示名称"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </div>
                            <Button
                              className="w-full"
                              onClick={() => handleEditUser(u.id)}
                              disabled={updateUserMutation.isPending}
                            >
                              {updateUserMutation.isPending ? "保存中..." : "保存修改"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      {/* 重置密码 */}
                      <Dialog
                        open={showResetPassword === u.id}
                        onOpenChange={(open) => {
                          setShowResetPassword(open ? u.id : null);
                          if (!open) setResetPassword("");
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="w-8 h-8">
                            <Lock className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>重置密码 - {u.name || u.username}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>新密码</Label>
                              <Input
                                type="password"
                                placeholder="至少6个字符"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                              />
                            </div>
                            <Button
                              className="w-full"
                              onClick={() => handleResetPassword(u.id)}
                              disabled={resetPasswordMutation.isPending}
                            >
                              {resetPasswordMutation.isPending ? "重置中..." : "确认重置"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      {/* 删除用户 */}
                      <Dialog
                        open={showDeleteUser === u.id}
                        onOpenChange={(open) => setShowDeleteUser(open ? u.id : null)}
                      >
                        <DialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-red-500 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>删除用户 - {u.name || u.username}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              确定要删除这个用户吗？此操作不可恢复，将删除用户的所有数据。
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setShowDeleteUser(null)}
                              >
                                取消
                              </Button>
                              <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={deleteUsersMutation.isPending}
                              >
                                {deleteUsersMutation.isPending ? "删除中..." : "确认删除"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* 邀请管理 */}
          <TabsContent value="invitations">
            <Card className="p-4">
              <InvitationManager />
            </Card>
          </TabsContent>

          {/* 知识管理 */}
          <TabsContent value="knowledge">
            <Card className="p-4">
              <h2 className="font-bold mb-4">知识内容管理</h2>
              <p className="text-muted-foreground text-sm">
                在这里管理知识宝库的内容，包括添加、编辑和删除科普文章。
              </p>
              <div className="mt-4">
                <Link href="/knowledge">
                  <Button variant="outline">
                    <BookOpen className="w-4 h-4 mr-2" />
                    前往知识宝库管理
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          {/* 任务管理 */}
          <TabsContent value="tasks">
            <Card className="p-4">
              <h2 className="font-bold mb-4">任务管理</h2>
              <p className="text-muted-foreground text-sm">
                在这里管理每日任务和周任务，设置任务奖励。
              </p>
              <div className="mt-4">
                <Link href="/rewards">
                  <Button variant="outline">
                    <ListTodo className="w-4 h-4 mr-2" />
                    前往奖励中心管理
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          {/* 总库管理 */}
          <TabsContent value="masterLibrary">
            <MasterLibraryManager />
          </TabsContent>

          <TabsContent value="points">
            <PointsManagement />
          </TabsContent>

          {/* 游戏奖励配置 */}
          <TabsContent value="gameReward">
            <GameRewardManager />
          </TabsContent>



          {/* 账户关系管理 */}
          <TabsContent value="accountRelationship">
            <AccountRelationshipManager />
          </TabsContent>

          {/* 功能权限管理 */}
          <TabsContent value="permissions">
            <UserPermissionsManager />
          </TabsContent>

          {/* AI 管理 */}
          <TabsContent value="aiManagement">
            <Card className="p-4">
              <h2 className="font-bold mb-4">AI 管理</h2>
              <p className="text-muted-foreground text-sm mb-4">
                在这里管理 AI 提示词、企业报告等 AI 功能。
              </p>
              <Link href="/parent/ai-management">
                <Button className="bg-[#A80000] hover:bg-[#8a0000] text-white border-0">
                  <Sparkles className="w-4 h-4 mr-2" />
                  前往 AI 管理
                </Button>
              </Link>
            </Card>
          </TabsContent>

          <TabsContent value="dataSecurity">
            <DataSecurityPanel />
          </TabsContent>
          <TabsContent value="equity">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">股权激励管理</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                管理投资股东的资金记录、查看股东股权总览、配置股份池规则。
              </p>
              <Link href="/admin/equity">
                <Button className="bg-[#A80000] hover:bg-[#8a0000]">
                  <Coins className="w-4 h-4 mr-2" />
                  前往股权管理
                </Button>
              </Link>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
