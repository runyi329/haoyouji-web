import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import {
  User,
  Camera,
  ChevronRight,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  GraduationCap,
  LogOut,
  Coins,
  Heart,
  Users,
  Calendar,
  Award,
  BookOpen,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

export default function Profile() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOSSafari, promptInstall } = usePWAInstall();

  // 获取当前用户信息
  const { data: user, refetch: refetchUser } = trpc.auth.me.useQuery();

  // 头像上传状态
  const [isUploading, setIsUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  // 图片裁剪状态
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // 编辑个人信息对话框
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
  });

  // 修改密码对话框
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // 头像上传mutation
  const uploadAvatarMutation = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      toast.success("头像上传成功");
      refetchUser();
      setAvatarPreview(null);
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error(`头像上传失败: ${error.message}`);
      setIsUploading(false);
    },
  });

  // 更新个人信息mutation
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("个人信息更新成功");
      refetchUser();
      setIsEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  // 修改密码mutation
  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("密码修改成功,请重新登录");
      setIsPasswordDialogOpen(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setTimeout(() => {
        trpc.auth.logout.useMutation().mutate();
        navigate("/");
      }, 1500);
    },
    onError: (error) => {
      toast.error(`密码修改失败: ${error.message}`);
    },
  });

  // 退出登录mutation
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("已退出登录");
      navigate("/");
    },
  });

  // 处理头像选择
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过5MB");
      return;
    }

    // 检查文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    // 读取图片并打开裁剪对话框
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setIsCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
    
    // 重置input以便可以选择同一文件
    e.target.value = "";
  };
  
  // 处理裁剪完成
  const handleCropComplete = async (croppedBlob: Blob) => {
    setIsUploading(true);
    
    // 将Blob转换为base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      setAvatarPreview(base64Data);
      
      // 上传裁剪后的图片
      uploadAvatarMutation.mutate({
        imageData: base64Data,
      });
    };
    reader.readAsDataURL(croppedBlob);
  };

  // 处理个人信息编辑
  const handleEditProfile = () => {
    navigate("/parent/profile/settings");
  };

  // 提交个人信息
  const handleSubmitProfile = () => {
    if (!editForm.name.trim()) {
      toast.error("姓名不能为空");
      return;
    }
    updateProfileMutation.mutate(editForm);
  };

  // 提交密码修改
  const handleSubmitPassword = () => {
    if (!passwordForm.currentPassword) {
      toast.error("请输入当前密码");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("新密码至少需要6位");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayAvatar = avatarPreview || user.avatar || "/default-avatar.png";

  // 功能分组配置
  const featureGroups = [
    // 超级管理员专属功能
    ...(user.role === "super_admin" ? [{
      title: "管理功能",
      items: [
        { icon: ShieldCheck, label: "后台管理", badge: null, onClick: () => navigate("/admin") },
      ],
    }] : []),
    {
      title: "常用功能",
      items: [
        { 
          icon: Smartphone, 
          label: isInstalled ? "已安装" : "安卓主屏", 
          badge: null, 
          onClick: async () => {
            // iOS Safari 需要手动引导，跳转到说明页面
            if (isIOSSafari) {
              navigate("/parent/academy#pwa");
              return;
            }
            
            // 已安装，提示用户
            if (isInstalled) {
              toast.success("应用已安装到桌面");
              return;
            }
            
            // Android/桌面 Chrome 支持直接安装
            if (isInstallable) {
              const success = await promptInstall();
              if (success) {
                toast.success("安装成功！请查看桌面图标");
              }
            } else {
              // 不支持自动安装，跳转到说明页面
              navigate("/parent/academy#pwa");
            }
          } 
        },
        { icon: Heart, label: "我的收藏", badge: null, onClick: () => toast("功能开发中") },
        { icon: Users, label: "我的好友", badge: null, onClick: () => toast("功能开发中") },
        { icon: Calendar, label: "活动记录", badge: null, onClick: () => toast("功能开发中") },
        { icon: Award, label: "我的积分", badge: user.points, onClick: () => navigate("/parent/points") },
      ],
    },
    {
      title: "账户管理",
      items: [
        { icon: User, label: "编辑资料", badge: null, onClick: handleEditProfile },
        { icon: Shield, label: "修改密码", badge: null, onClick: () => setIsPasswordDialogOpen(true) },
        { icon: Bell, label: "消息通知", badge: null, onClick: () => toast("功能开发中") },
        { icon: Settings, label: "隐私设置", badge: null, onClick: () => toast("功能开发中") },
      ],
    },
    {
      title: "帮助与支持",
      items: [
        { icon: GraduationCap, label: "脉动学院", badge: null, onClick: () => navigate("/parent/academy") },
        { icon: HelpCircle, label: "帮助中心", badge: null, onClick: () => toast("功能开发中") },
        { icon: BookOpen, label: "关于我们", badge: null, onClick: () => toast("功能开发中") },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container max-w-4xl py-8 px-4">
        {/* 顶部用户信息卡片 */}
        <div className="p-6 mb-6">
          <div className="flex items-center gap-4">
            {/* 头像 */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-blue-100 dark:ring-blue-900">
                <img
                  src={displayAvatar}
                  alt="用户头像"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-lg transition-all group-hover:scale-110 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* 用户信息 */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {user.name || user.username}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                个人资料和设置
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {user.role === "super_admin" ? "超级管理员" : user.role === "admin" ? "管理员" : "普通用户"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 功能分组 - 网格布局 */}
        {featureGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-8">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">
              {group.title}
            </h3>
            <div className="grid grid-cols-4 gap-6">
              {group.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <button
                    key={itemIndex}
                    onClick={item.onClick}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70 relative"
                  >
                    <Icon className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 text-center">
                      {item.label}
                    </span>
                    {item.badge !== null && (
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* 退出登录按钮 */}
        <Button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          variant="outline"
          className="w-full rounded-2xl h-14 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 border-2"
        >
          <LogOut className="w-5 h-5 mr-2" />
          退出登录
        </Button>
      </div>

      {/* 图片裁剪对话框 */}
      {selectedImage && (
        <ImageCropDialog
          open={isCropDialogOpen}
          onClose={() => setIsCropDialogOpen(false)}
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
        />
      )}

      {/* 编辑个人信息对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑个人信息</DialogTitle>
            <DialogDescription>修改您的个人资料</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="请输入姓名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                placeholder="请输入邮箱"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitProfile}
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改密码对话框 */}
      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>
              请输入当前密码和新密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    currentPassword: e.target.value,
                  })
                }
                placeholder="请输入当前密码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value,
                  })
                }
                placeholder="请输入新密码(至少6位)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value,
                  })
                }
                placeholder="请再次输入新密码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPasswordDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitPassword}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? "修改中..." : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
