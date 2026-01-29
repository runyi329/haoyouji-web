import { useRef, useState, useEffect } from "react";
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
  ChevronUp,
  ChevronDown,
  Palette,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


// 定义所有可用的功能项
type FeatureItem = {
  id: string;
  icon: any;
  label: string;
  badge?: number | null;
  onClick: () => void;
};

// 可拖拽的功能项组件
function SortableFeatureItem({ item }: { item: FeatureItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.icon;

  // 处理点击事件，确保短按时触发点击，长按时不触发
  const handleClick = (e: React.MouseEvent) => {
    // 如果正在拖拽，不触发点击
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    item.onClick();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative group select-none"
    >
      <button
        onClick={handleClick}
        className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70 w-full"
      >
        <Icon className="w-6 h-6 text-slate-600 dark:text-slate-300" />
        <span className="text-xs text-slate-700 dark:text-slate-300 text-center">
          {item.label}
        </span>
        {item.badge !== null && item.badge !== undefined && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
            {item.badge}
          </span>
        )}
      </button>
    </div>
  );
}

export default function Profile() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOSSafari, promptInstall } = usePWAInstall();

  // 获取当前用户信息
  const { data: user, refetch: refetchUser } = trpc.auth.me.useQuery();
  
  // 获取当前用户积分
  const { data: pointsData } = trpc.pointSystem.getMyPoints.useQuery();

  // 获取用户功能顺序配置
  const { data: favoritesData, refetch: refetchFavorites } = trpc.profileFeatures.getFavorites.useQuery();

  // 保存功能顺序配置
  const saveFavoritesMutation = trpc.profileFeatures.saveFavorites.useMutation({
    onSuccess: () => {
      refetchFavorites();
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
    },
  });

  // 功能顺序状态
  const [featureOrder, setFeatureOrder] = useState<string[]>([]);

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

  // 退出登录确认对话框
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
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
      toast.success("密码修改成功");
      setIsPasswordDialogOpen(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: (error) => {
      toast.error(`修改失败: ${error.message}`);
    },
  });

  // 退出登录mutation
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  // 初始化功能顺序列表
  useEffect(() => {
    if (favoritesData?.favorites) {
      setFeatureOrder(favoritesData.favorites);
    }
  }, [favoritesData]);

  // 处理头像点击
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（限制为 5MB）
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }

    // 检查文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    // 读取文件并显示预览
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setSelectedImage(result);
      setIsCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  // 处理裁剪完成
  const handleCropComplete = async (croppedImageBlob: Blob) => {
    setIsUploading(true);
    setIsCropDialogOpen(false);

    try {
      // 转换为 base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        uploadAvatarMutation.mutate({ avatar: base64String });
      };
      reader.readAsDataURL(croppedImageBlob);
    } catch (error) {
      toast.error("图片处理失败");
      setIsUploading(false);
    }
  };

  // 处理编辑个人信息
  const handleEditProfile = () => {
    setEditForm({
      name: user?.name || "",
      email: user?.email || "",
    });
    setIsEditDialogOpen(true);
  };

  // 提交个人信息更新
  const handleSubmitProfile = () => {
    if (!editForm.name.trim()) {
      toast.error("姓名不能为空");
      return;
    }
    updateProfileMutation.mutate({
      name: editForm.name,
      email: editForm.email || undefined,
    });
  };

  // 提交密码修改
  const handleSubmitPassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("请填写所有密码字段");
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

  // 配置拖拽传感器（与脉动首页相同的配置）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,  // 长按250ms后才激活拖拽
        tolerance: 8,  // 允许8px的移动误差
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = featureOrder.indexOf(active.id as string);
      const newIndex = featureOrder.indexOf(over.id as string);

      const newOrder = arrayMove(featureOrder, oldIndex, newIndex);
      setFeatureOrder(newOrder);
      saveFavoritesMutation.mutate({ featureIds: newOrder });

      // 震动反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayAvatar = avatarPreview || user.avatar || "/default-avatar.png";

  // 定义所有可用的功能项
  const allFeatures: FeatureItem[] = [
    // 超级管理员专属功能
    ...(user.role === "super_admin" ? [
      { id: "admin-panel", icon: ShieldCheck, label: "后台管理", badge: null, onClick: () => navigate("/admin") },
    ] : []),
    // 编辑资料（所有用户都可用）
    { id: "edit-profile", icon: User, label: "编辑资料", badge: null, onClick: handleEditProfile },
    { 
      id: "install-app",
      icon: Smartphone, 
      label: isInstalled ? "已安装" : "安卓主屏", 
      badge: null, 
      onClick: async () => {
        if (isIOSSafari) {
          navigate("/parent/academy#pwa");
          return;
        }
        if (isInstalled) {
          toast.success("应用已安装到桌面");
          return;
        }
        if (isInstallable) {
          const success = await promptInstall();
          if (success) {
            toast.success("安装成功！请查看桌面图标");
          }
        } else {
          navigate("/parent/academy#pwa");
        }
      } 
    },
    { id: "favorites", icon: Heart, label: "我的收藏", badge: null, onClick: () => toast("功能开发中") },
    { id: "friends", icon: Users, label: "我的好友", badge: null, onClick: () => toast("功能开发中") },
    { id: "calendar", icon: Calendar, label: "活动记录", badge: null, onClick: () => toast("功能开发中") },
    { id: "points", icon: Award, label: "我的积分", badge: user.points, onClick: () => navigate("/parent/points") },
  ];

  // 账户管理功能（不包括编辑资料，已移至常用功能）
  const accountFeatures: FeatureItem[] = [
    { id: "change-password", icon: Shield, label: "修改密码", badge: null, onClick: () => setIsPasswordDialogOpen(true) },
    { id: "notifications", icon: Bell, label: "消息通知", badge: null, onClick: () => toast("功能开发中") },
    { id: "privacy", icon: Settings, label: "隐私设置", badge: null, onClick: () => toast("功能开发中") },
  ];

  // 帮助与支持功能
  const helpFeatures: FeatureItem[] = [
    { id: "theme-settings", icon: Palette, label: "高级皮肤", badge: null, onClick: () => navigate("/parent/theme-settings") },
    { id: "academy", icon: GraduationCap, label: "脉动学院", badge: null, onClick: () => navigate("/parent/academy") },
    { id: "help", icon: HelpCircle, label: "帮助中心", badge: null, onClick: () => toast("功能开发中") },
    { id: "about", icon: BookOpen, label: "关于我们", badge: null, onClick: () => toast("功能开发中") },
  ];

  // 根据顺序排序所有功能
  const sortedFeatures = [...allFeatures].sort((a, b) => {
    const indexA = featureOrder.indexOf(a.id);
    const indexB = featureOrder.indexOf(b.id);
    
    // 如果都在顺序列表中，按顺序排
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // 如果只有A在列表中，A排前面
    if (indexA !== -1) return -1;
    // 如果只有B在列表中，B排前面
    if (indexB !== -1) return 1;
    // 都不在列表中，保持原顺序
    return 0;
  });



  return (
    <div className="min-h-screen pb-20"
      style={{
        background: 'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 100%, white), color-mix(in srgb, var(--color-primary) 5%, var(--color-background)), color-mix(in srgb, var(--color-secondary) 5%, var(--color-background)))'
      }}>
      <div className="container max-w-4xl py-8 px-4 relative">
        {/* 顶部用户信息卡片 */}
        <div className="mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="space-y-4">
            {/* 头像 */}
            <div className="relative group w-20">
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
                className="absolute bottom-0 right-0 text-white rounded-full p-1.5 shadow-md transition-all group-hover:scale-110 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-primary)'
                }}
              >
                <Camera className="w-3 h-3" />
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
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {user.name || user.username}
                </h2>
                {/* 退出登录按钮 */}
                <button
                  onClick={() => setIsLogoutDialogOpen(true)}
                  className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-6 h-6 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400" />
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                个人资料和设置
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, white)',
                    color: 'var(--color-primary)'
                  }}>
                  {user.role === "super_admin" ? "超级管理员" : user.role === "admin" ? "管理员" : "普通用户"}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-secondary) 15%, white)',
                    color: 'var(--color-secondary)'
                  }}>
                  ⭐ {pointsData?.points || 0} 积分
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 功能列表 */}
        <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">
            功能
          </h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedFeatures.map(f => f.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-4 gap-6">
                {sortedFeatures.map((item) => (
                  <SortableFeatureItem key={item.id} item={item} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* 账户管理 - 固定分区 */}
        <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">
            账户管理
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {accountFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                >
                  <Icon className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 text-center">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 帮助与支持 - 固定分区 */}
        <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">
            帮助与支持
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {helpFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                >
                  <Icon className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 text-center">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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

      {/* 退出登录确认对话框 */}
      <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确定要退出当前账户吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLogoutDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setIsLogoutDialogOpen(false);
                logoutMutation.mutate();
              }}
              disabled={logoutMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {logoutMutation.isPending ? "退出中..." : "确认退出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="请输入姓名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
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
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>请输入当前密码和新密码</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="请输入当前密码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="请输入新密码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
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
