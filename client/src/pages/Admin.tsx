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
  Briefcase,
  Wallet,
  Package,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ValuationManagement from "./admin/ValuationManagement";
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
import { CreditCard } from "lucide-react";
import VocabularyMasterManager from "./admin/VocabularyMasterManager";
import AccountRelationshipManager from "./admin/AccountRelationshipManager";
import MasterLibraryManager from "./admin/MasterLibraryManager";
import UserPermissionsManager from "./admin/UserPermissionsManager";
import PointsManagement from "./admin/PointsManagement";
import DataSecurityPanel from "./admin/DataSecurityPanel";
import CustomAAManager from "./admin/CustomAAManager";
import ProductLibraryManager from "./admin/ProductLibraryManager";
import PlatformProductLibrary from "./admin/PlatformProductLibrary";

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
  
  // 查看用户支付信息
  const [showUserPayment, setShowUserPayment] = useState<number | null>(null);
  const [userPaymentData, setUserPaymentData] = useState<any>(null);
  
  // 用户搜索
  const [searchKeyword, setSearchKeyword] = useState("");

  const { data: users, refetch: refetchUsers } = trpc.admin.getUsers.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });
  
  // 搜索过滤用户
  const filteredUsers = users?.filter((u) => {
    if (!searchKeyword) return true;
    const keyword = searchKeyword.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(keyword)) ||
      (u.name && u.name.toLowerCase().includes(keyword))
    );
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
    if (!editUsername || editUsername.length < 1) {
      toast.error("用户名长度至少1个字符");
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
            <ShieldCheck className="w-5 h-5 text-[#D32F2F]" />
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
            <TabsTrigger value="valuation" className="text-xs sm:text-sm">
              <Coins className="w-4 h-4 mr-1 hidden sm:inline" />
              市值管理
            </TabsTrigger>
            <TabsTrigger value="partnership" className="text-xs sm:text-sm">
              <Briefcase className="w-4 h-4 mr-1 hidden sm:inline" />
              合伙人平台
            </TabsTrigger>
            <TabsTrigger value="recharge" className="text-xs sm:text-sm">
              <Wallet className="w-4 h-4 mr-1 hidden sm:inline" />
              充值监控
            </TabsTrigger>
            <TabsTrigger value="sentia" className="text-xs sm:text-sm">
              <Coins className="w-4 h-4 mr-1 hidden sm:inline" />
              Sentia
            </TabsTrigger>
            <TabsTrigger value="customAA" className="text-xs sm:text-sm">
              <BookMarked className="w-4 h-4 mr-1 hidden sm:inline" />
              定制账本
            </TabsTrigger>
            <TabsTrigger value="productLibrary" className="text-xs sm:text-sm">
              <Package className="w-4 h-4 mr-1 hidden sm:inline" />
              商品库
            </TabsTrigger>
            <TabsTrigger value="platformLibrary" className="text-xs sm:text-sm">
              <Package className="w-4 h-4 mr-1 hidden sm:inline" />
              平台总库
            </TabsTrigger>
          </TabsList>



          {/* 用户管理 */}
          <TabsContent value="users">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">用户管理</h2>
                <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark text-white border-0">
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
                        className="w-full bg-[#D32F2F] hover:bg-[#D32F2F]-dark text-white border-0"
                        disabled={createUserMutation.isPending}
                      >
                        {createUserMutation.isPending ? "创建中..." : "创建用户"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              
              {/* 用户搜索框 */}
              <div className="mb-4">
                <Input
                  placeholder="搜索用户名、昵称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="max-w-md"
                />
              </div>

              {/* 用户列表 */}
              <div className="space-y-3">
                {filteredUsers?.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-lg bg-muted/50 space-y-3"
                  >
                    {/* 用户信息区 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{u.name || u.username}</span>
                        {u.role === "super_admin" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-[#FFEBEE] text-[#D32F2F]">
                            超级管理员
                          </span>
                        )}
                        {u.role === "parent" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-[#F5F5F5] text-[#1976D2]">
                            家长
                          </span>
                        )}
                        {u.role === "baby" && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-pink-100 text-pink-600">
                            宝宝
                          </span>
                        )}
                        {u.isLocked && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-[#FFEBEE] text-[#D32F2F]">
                            已锁定
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        @{u.username} · {u.points} 积分
                      </p>
                      {u.createdAt && (
                        <p className="text-xs text-muted-foreground">
                          注册时间：{new Date(u.createdAt).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                    </div>
                    
                    {/* 操作按钮区 - 移动端优化布局 */}
                    <div className="flex items-center gap-1 flex-wrap">
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
                            ? 'text-[#4CAF50] hover:text-green-700' 
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
                      
                      {/* 查看支付信息 */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8"
                        onClick={async () => {
                          try {
                            const response = await fetch(`/api/admin/user-profile/${u.id}`);
                            const data = await response.json();
                            setUserPaymentData(data);
                            setShowUserPayment(u.id);
                          } catch (error) {
                            toast.error("获取用户支付信息失败");
                          }
                        }}
                        title="查看支付信息"
                      >
                        <CreditCard className="w-4 h-4" />
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
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-[#D32F2F] hover:text-[#D32F2F]">
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
                  </div>                ))}
              </div>
              
              {/* 查看用户支付信息 Dialog */}
              <Dialog open={showUserPayment !== null} onOpenChange={(open) => !open && setShowUserPayment(null)}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>用户支付信息</DialogTitle>
                  </DialogHeader>
                  {userPaymentData && (
                    <div className="space-y-4">
                      {/* 基本信息 */}
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">基本信息</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">用户名：</span>
                            <span className="ml-2 font-medium">{userPaymentData.user?.username}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">姓名：</span>
                            <span className="ml-2 font-medium">{userPaymentData.user?.name || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">邮箱：</span>
                            <span className="ml-2 font-medium">{userPaymentData.user?.email || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">积分：</span>
                            <span className="ml-2 font-medium">{userPaymentData.user?.points || 0}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* 支付账号 */}
                      {userPaymentData.profile?.payment_method ? (
                        <div className="p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-sm font-medium text-gray-700">支付账号</h3>
                            <span className="px-2.5 py-0.5 bg-[#D32F2F] text-white text-xs font-medium rounded">
                              {userPaymentData.profile.payment_method === 'bank_card' && '银行卡'}
                              {userPaymentData.profile.payment_method === 'digital_wallet' && '数字钱包'}
                              {userPaymentData.profile.payment_method === 'alipay' && '支付宝'}
                              {userPaymentData.profile.payment_method === 'wechat' && '微信'}
                            </span>
                          </div>
                          
                          {/* 银行卡 */}
                          {userPaymentData.profile.payment_method === 'bank_card' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">银行名称：</span>
                                <span className="font-medium">{userPaymentData.profile.bank_name}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">银行卡号：</span>
                                <span className="font-medium font-mono">{userPaymentData.profile.bank_account_number}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">持卡人：</span>
                                <span className="font-medium">{userPaymentData.profile.bank_account_name}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* 数字钱包 */}
                          {userPaymentData.profile.payment_method === 'digital_wallet' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">收款网络：</span>
                                <span className="font-medium">{userPaymentData.profile.wallet_network}</span>
                              </div>
                              {userPaymentData.profile.digital_wallet_address && (
                                <div className="flex items-start">
                                  <span className="text-gray-500 min-w-[100px] flex-shrink-0">钱包地址：</span>
                                  <span className="font-medium font-mono text-xs break-all">{userPaymentData.profile.digital_wallet_address}</span>
                                </div>
                              )}
                              {userPaymentData.profile.wallet_qr_code_url && (
                                <div className="flex items-center">
                                  <span className="text-gray-500 min-w-[100px]">收款码：</span>
                                  <a href={userPaymentData.profile.wallet_qr_code_url} target="_blank" rel="noopener noreferrer" className="text-[#1976D2] text-xs hover:underline">查看图片</a>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 支付宝 */}
                          {userPaymentData.profile.payment_method === 'alipay' && (
                            <div className="space-y-2 text-sm">
                              {userPaymentData.profile.alipay_account && (
                                <div className="flex items-center">
                                  <span className="text-gray-500 min-w-[100px]">支付宝账号：</span>
                                  <span className="font-medium">{userPaymentData.profile.alipay_account}</span>
                                </div>
                              )}
                              {userPaymentData.profile.alipay_qr_code_url && (
                                <div className="flex items-center">
                                  <span className="text-gray-500 min-w-[100px]">收款码：</span>
                                  <a href={userPaymentData.profile.alipay_qr_code_url} target="_blank" rel="noopener noreferrer" className="text-[#1976D2] text-xs hover:underline">查看图片</a>
                                </div>
                              )}
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">收款人：</span>
                                <span className="font-medium">{userPaymentData.profile.alipay_account_name}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* 微信 */}
                          {userPaymentData.profile.payment_method === 'wechat' && (
                            <div className="space-y-2 text-sm">
                              {userPaymentData.profile.wechat_qr_code_url && (
                                <div className="flex items-center">
                                  <span className="text-gray-500 min-w-[100px]">收款码：</span>
                                  <a href={userPaymentData.profile.wechat_qr_code_url} target="_blank" rel="noopener noreferrer" className="text-[#1976D2] text-xs hover:underline">查看图片</a>
                                </div>
                              )}
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">收款人：</span>
                                <span className="font-medium">{userPaymentData.profile.wechat_account_name}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          该用户尚未绑定支付账号
                        </div>
                      )}
                      
                      {/* 实名认证 */}
                      {userPaymentData.profile?.real_name && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-700 mb-3">实名认证</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center">
                              <span className="text-gray-500 min-w-[100px]">真实姓名：</span>
                              <span className="font-medium">{userPaymentData.profile.real_name}</span>
                            </div>
                            {userPaymentData.profile.id_card_number && (
                              <div className="flex items-center">
                                <span className="text-gray-500 min-w-[100px]">身份证号：</span>
                                <span className="font-medium font-mono">{userPaymentData.profile.id_card_number}</span>
                              </div>
                            )}
                            <div className="flex items-center">
                              <span className="text-gray-500 min-w-[100px]">认证状态：</span>
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                userPaymentData.profile.verification_status === 'verified' ? 'bg-[#E8F5E9] text-green-700' :
                                userPaymentData.profile.verification_status === 'pending' ? 'bg-[#FAF3ED] text-[#CBA471]' :
                                'bg-[#FFEBEE] text-[#D32F2F]'
                              }`}>
                                {userPaymentData.profile.verification_status === 'verified' && '已认证'}
                                {userPaymentData.profile.verification_status === 'pending' && '待审核'}
                                {userPaymentData.profile.verification_status === 'rejected' && '已拒绝'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* 收件地址 */}
                      {userPaymentData.addresses && userPaymentData.addresses.length > 0 && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-700 mb-3">收件地址</h3>
                          <div className="space-y-3">
                            {userPaymentData.addresses.map((addr: any, index: number) => (
                              <div key={index} className="p-3 bg-white border border-gray-200 rounded text-sm">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-medium">{addr.recipient_name}</span>
                                  <span className="text-gray-500">{addr.recipient_phone}</span>
                                  {addr.is_default && (
                                    <span className="px-2 py-0.5 bg-[#D32F2F] text-white text-xs rounded">默认</span>
                                  )}
                                </div>
                                <p className="text-gray-600">{addr.address}</p>
                                {addr.postal_code && (
                                  <p className="text-gray-500 text-xs mt-1">邮编：{addr.postal_code}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
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



          {/* AI 管理 */}
          <TabsContent value="aiManagement">
            <Card className="p-4">
              <h2 className="font-bold mb-4">AI 管理</h2>
              <p className="text-muted-foreground text-sm mb-4">
                在这里管理 AI 提示词、企业报告等 AI 功能。
              </p>
              <Link href="/parent/ai-management">
                <Button className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark text-white border-0">
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
                <Button className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark">
                  <Coins className="w-4 h-4 mr-2" />
                  前往股权管理
                </Button>
              </Link>
            </Card>
          </TabsContent>
          <TabsContent value="valuation">
            <ValuationManagement />
          </TabsContent>
          
          {/* 合伙人平台 */}
          <TabsContent value="partnership">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4">合伙人平台管理</h2>
              <p className="text-gray-600 mb-4">管理首页数据看板的内容，包括最新动态和预警雷达。</p>
              <Button 
                onClick={() => setLocation('/partnership/dashboard-manage')}
                className="bg-[#D32F2F] hover:bg-[#B71C1C]"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                进入管理页面
              </Button>
            </Card>
          </TabsContent>
          
          {/* 充值系统监控 */}
          <TabsContent value="recharge">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4">充值系统监控</h2>
              <p className="text-gray-600 mb-4">查看区块链扫描器状态、充值订单、未匹配交易和系统统计信息。</p>
              <Button 
                onClick={() => setLocation('/admin/recharge-monitor')}
                className="bg-[#D32F2F] hover:bg-[#B71C1C]"
              >
                <Wallet className="w-4 h-4 mr-2" />
                进入监控页面
              </Button>
            </Card>
          </TabsContent>

          {/* Sentia 数字货币子站 */}
          <TabsContent value="sentia">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png"
                  alt="Sentia"
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <h2 className="text-xl font-bold">Sentia (SNT) 数字货币</h2>
                  <p className="text-sm text-gray-500">AI 赛道 · 发行总量 10 亿枚 · 合伙人价 $0.04</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                预期上线时间：2026年6月底（币安）。以下为测试链接，可分享给合伙人预览页面效果。
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => setLocation('/sentia')}
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  <Coins className="w-4 h-4 mr-2" />
                  查看 Sentia 官网首页
                </Button>
                <Button
                  onClick={() => setLocation('/sentia/buy')}
                  variant="outline"
                  className="border-[#7C3AED] text-[#7C3AED]"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  查看买币页（定向邀请）
                </Button>
              </div>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  💡 分享链接：将 <strong>/sentia</strong> 或 <strong>/sentia/buy</strong> 路径附在域名后即可分享给合伙人，无需登录即可访问。
                </p>
              </div>
            </Card>
          </TabsContent>

          {/* 定制账本(AA) 管理 */}
          <TabsContent value="customAA">
            <CustomAAManager />
          </TabsContent>

          {/* 脉动共享商盟 - 商品库管理 */}
          <TabsContent value="productLibrary">
            <ProductLibraryManager />
          </TabsContent>

          {/* 平台总商品库管理 */}
          <TabsContent value="platformLibrary">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">平台总商品库</h2>
                <p className="text-xs text-muted-foreground">管理平台总库商品，推送给商家，审核导入申请</p>
              </div>
              <PlatformProductLibrary />
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
