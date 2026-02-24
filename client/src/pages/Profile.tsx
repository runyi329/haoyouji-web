import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { trpc } from "@/lib/trpc";

import { blobToBase64, compressAvatar } from "@/utils/imageUtils";
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
  ArrowLeft,
  UserPlus,
  MessageCircle,
  Briefcase,
  Ticket,
  Wallet,
} from "lucide-react";
import { UsdtIcon } from "@/components/icons/UsdtIcon";
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
  color: string;
  badge?: number | null;
  onClick: () => void;
};

// 可拖拽的功能项组件 - 首页风格（圆形彩色背景图标）
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

  const handleClick = (e: React.MouseEvent) => {
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
      className="relative select-none"
    >
      <button
        onClick={handleClick}
        className="flex flex-col items-center space-y-2 w-full cursor-pointer"
      >
        <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-[#757575] text-center">
          {item.label}
        </span>
        {item.badge !== null && item.badge !== undefined && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[#D32F2F]-light0 text-white">
            {item.badge}
          </span>
        )}
      </button>
    </div>
  );
}

// 静态功能项组件（不可拖拽）
function StaticFeatureItem({ item }: { item: FeatureItem }) {
  const Icon = item.icon;
  return (
    <button
      onClick={item.onClick}
      className="flex flex-col items-center space-y-2 cursor-pointer"
    >
      <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center shadow-sm`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium text-[#757575] text-center">
        {item.label}
      </span>
    </button>
  );
}

export default function Profile() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOSSafari, promptInstall } = usePWAInstall();

  // 获取当前用户信息
  const { data: user, refetch: refetchUser, isLoading: userLoading } = trpc.auth.me.useQuery(undefined, {
    retry: 1,
    staleTime: 30000,
  });
  
  // 获取当前用户积分
  const { data: pointsData } = trpc.pointSystem.getMyPoints.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
    staleTime: 30000,
  });

  // 获取用户股权数据（用于显示节点等级光环）
  const { data: equityData } = trpc.equity.getMyEquity.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
    staleTime: 30000,
  });

  // 获取用户功能顺序配置
  const { data: favoritesData, refetch: refetchFavorites } = trpc.profileFeatures.getFavorites.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
    staleTime: 30000,
  });

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
      document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = "https://www.jiangyuchen.cn/login";
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

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

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
      const compressedBase64 = await compressAvatar(croppedImageBlob, 256, 0.8);
      uploadAvatarMutation.mutate({ imageData: compressedBase64 });
    } catch (error) {
      toast.error(`图片处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsUploading(false);
    }
  };

  // 处理编辑个人信息
  const handleEditProfile = () => {
    navigate("/profile/edit");
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

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
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

  // 定义所有可用的功能项（带颜色）
  const allFeatures: FeatureItem[] = [
    { id: "edit-profile", icon: User, label: "编辑资料", color: "bg-[#F5F5F5] text-[#1976D2]", badge: null, onClick: handleEditProfile },
    { 
      id: "invite-friends",
      icon: UserPlus, 
      label: "邀请好友", 
      color: "bg-[#FAF3ED] text-[#CBA471]",
      badge: null, 
      onClick: () => navigate("/parent/profile/invite")
    },
    { id: "my-equity", icon: Coins, label: "我的股权", color: "bg-[#FAF3ED] text-[#CBA471]", badge: null, onClick: () => navigate("/parent/my-equity") },
    { id: "my-coupons", icon: Ticket, label: "我的卡券", color: "bg-[#FFF3E0] text-[#FF9800]", badge: null, onClick: () => navigate("/coupons") },
    { id: "payment-accounts", icon: Wallet, label: "支付账户", color: "bg-[#E3F2FD] text-[#2196F3]", badge: null, onClick: () => navigate("/payment-accounts") },
    { id: "recharge", icon: UsdtIcon, label: "充值", color: "bg-[#E8F5E9] text-[#4CAF50]", badge: null, onClick: () => navigate("/recharge") },
    { id: "favorites", icon: Heart, label: "我的收藏", color: "bg-[#FFEBEE] text-pink-600", badge: null, onClick: () => navigate("/parent/poster-favorites") },
    { id: "calendar", icon: Calendar, label: "节点成长", color: "bg-[#E8F5E9] text-[#4CAF50]", badge: null, onClick: () => navigate("/work-groups") },
    { id: "points", icon: Award, label: "我的积分", color: "bg-[#FAF3ED] text-[#CBA471]", badge: null, onClick: () => navigate("/parent/points") },
    { id: "ai-assistant", icon: MessageCircle, label: "AI助手", color: "bg-[#F3E5F5] text-purple-600", badge: null, onClick: () => navigate("/ai") },
  ];

  // 账户管理功能
  const accountFeatures: FeatureItem[] = [
    ...(user.role === "super_admin" ? [
      { id: "admin-panel", icon: ShieldCheck, label: "后台管理", color: "bg-[#D32F2F]-light text-[#D32F2F]", badge: null, onClick: () => navigate("/admin") },
    ] : []),
    { id: "change-password", icon: Shield, label: "修改密码", color: "bg-indigo-50 text-indigo-600", badge: null, onClick: () => setIsPasswordDialogOpen(true) },
    { id: "notifications", icon: Bell, label: "消息通知", color: "bg-[#FAF3ED] text-[#CBA471]", badge: null, onClick: () => toast("功能开发中") },
    { id: "privacy", icon: Settings, label: "隐私设置", color: "bg-slate-100 text-slate-600", badge: null, onClick: () => toast("功能开发中") },
  ];

  // 帮助与支持功能
  const helpFeatures: FeatureItem[] = [
    { id: "theme-settings", icon: Palette, label: "高级皮肤", color: "bg-[#D32F2F]-light text-[#D32F2F]", badge: null, onClick: () => navigate("/parent/theme-settings") },
    { id: "academy", icon: GraduationCap, label: "脉动学院", color: "bg-cyan-50 text-cyan-600", badge: null, onClick: () => navigate("/parent/academy") },
    { id: "help", icon: HelpCircle, label: "帮助中心", color: "bg-teal-50 text-teal-600", badge: null, onClick: () => toast("功能开发中") },
    { id: "about", icon: BookOpen, label: "关于我们", color: "bg-emerald-50 text-emerald-600", badge: null, onClick: () => navigate("/parent/business-plan") },
  ];

  // 根据顺序排序所有功能
  const sortedFeatures = [...allFeatures].sort((a, b) => {
    const indexA = featureOrder.indexOf(a.id);
    const indexB = featureOrder.indexOf(b.id);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });

  // 如果用户信息还在加载中，显示加载状态
  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#D32F2F]" />
      </div>
    );
  }

  // 如果没有用户信息，重定向到登录页
  if (!user) {
    window.location.href = "https://www.jiangyuchen.cn/login";
    return null;
  }

  return (
    <div className="bg-[#FAF3ED] pb-24 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部用户信息卡片 */}
      <div className="bg-gradient-to-br from-[#A80000] to-[#d44] px-4 pt-10 pb-6 relative">
        {/* 返回首页箭头 */}
        <button
          onClick={() => navigate("/")}
          className="absolute top-2 left-2 p-2 rounded-full hover:bg-white/10 transition-colors"
          title="返回首页"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-4">
          {/* 头像 */}
          <div className="relative group flex-shrink-0">
            <img
              src={displayAvatar}
              alt="用户头像"
              className="w-16 h-16 rounded-full object-cover"
            />
            <button
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="absolute bottom-0 right-0 bg-white text-[#D32F2F] rounded-full p-1 shadow-md transition-all group-hover:scale-110 disabled:opacity-50"
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
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">
              {user.name || user.username}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                {user.role === "super_admin" ? "超级管理员" : user.role === "admin" ? "管理员" : "普通用户"}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                {pointsData?.points || 0} 积分
              </span>
            </div>
          </div>

          {/* 退出登录 */}
          <button
            onClick={() => setIsLogoutDialogOpen(true)}
            className="flex-shrink-0 p-2 rounded-full hover:bg-white/10 transition-colors"
            title="退出登录"
          >
            <LogOut className="w-5 h-5 text-white/70" />
          </button>
        </div>
      </div>

      {/* 常用功能 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">常用功能</h3>
            <span className="text-xs text-gray-400">长按拖拽排序</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedFeatures.map(f => f.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-4 gap-4">
                {sortedFeatures.map((item) => (
                  <SortableFeatureItem key={item.id} item={item} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* 账户管理 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">账户管理</h3>
          <div className="grid grid-cols-4 gap-4">
            {accountFeatures.map((item) => (
              <StaticFeatureItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* 帮助与支持 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">帮助与支持</h3>
          <div className="grid grid-cols-4 gap-4">
            {helpFeatures.map((item) => (
              <StaticFeatureItem key={item.id} item={item} />
            ))}
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
              className="bg-[#D32F2F] hover:bg-[#D32F2F] text-white"
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
