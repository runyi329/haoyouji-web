import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Users, Baby, UserCircle, Edit2, Check, X, LogIn, Trash2, Info, Settings, ArrowLeft, ChevronRight, Palette, Search, Filter } from "lucide-react";
import { FeatureTreeManager } from "@/components/FeatureTreeManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

/**
 * 账户关系管理组件
 * 
 * 功能说明：
 * 1. 显示所有用户及其角色、家庭归属
 * 2. 支持编辑宝宝账户的家庭归属
 * 3. 清晰展示账户体系结构
 */
export default function AccountRelationshipManager() {
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [selectedRelatedUserId, setSelectedRelatedUserId] = useState<number | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingUserInfoId, setEditingUserInfoId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editName, setEditName] = useState("");
  const [featureManagementParentId, setFeatureManagementParentId] = useState<number | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [viConfigParentId, setViConfigParentId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  // 获取所有用户
  const { data: users } = trpc.admin.getUsers.useQuery();
  const utils = trpc.useUtils();
  
  // 不再需要families数据，直接通过users表的familyId关联
  // const { data: families } = trpc.admin.getFamilies.useQuery();
  
  // 获取所有宝宝档案
  const { data: specialKids } = trpc.specialKids.list.useQuery();

  // 获取游戏使用统计数据
  const { data: gameStats } = trpc.gameStats.getUsageStats.useQuery();

  // 根据familyId获取家长名称（直接通过users表查找）
  const getParentName = (familyId: number | null) => {
    if (!familyId || !users) return null;
    // 查找具有相同familyId且角色为parent的用户
    const parent = users.find((u) => u.role === 'parent' && u.familyId === familyId);
    return parent?.name || parent?.username || null;
  };

  // 根据家长的familyId获取宝宝列表（直接通过users表查找）
  const getKidsByParent = (parentFamilyId: number | null) => {
    if (!parentFamilyId || !users) return [];
    // 查找具有相同familyId且角色为baby的用户
    const babyUsers = users.filter((u) => u.role === 'baby' && u.familyId === parentFamilyId);
    // 返回宝宝的基本信息
    return babyUsers.map((baby) => {
      const kidInfo = specialKids?.find((k) => k.userId === baby.id);
      return {
        id: baby.id,
        name: baby.name || baby.username || '未命名',
        stars: kidInfo?.stars || 0,
      };
    });
  };

  // 切换钱包功能开关
  const toggleWalletMutation = trpc.admin.toggleWalletEnabled.useMutation({
    onSuccess: () => {
      toast.success("钱包功能状态已更新！");
      utils.admin.getUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 更新用户关系
  const updateUserRelationMutation = trpc.admin.updateUserRelation.useMutation({
    onSuccess: () => {
      toast.success("用户关系更新成功！");
      setEditingUserId(null);
      setSelectedRelatedUserId(null);
      // 使用invalidate强制清除缓存并重新查询
      utils.admin.getUsers.invalidate();
      utils.specialKids.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 批量删除用户
  const deleteUsersMutation = trpc.admin.deleteUsers.useMutation({
    onSuccess: () => {
      toast.success(`已成功删除 ${selectedUserIds.length} 个用户！`);
      setSelectedUserIds([]);
      setShowDeleteDialog(false);
      // 使用invalidate强制清除缓存并重新查询
      utils.admin.getUsers.invalidate();
      utils.specialKids.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 角色标签颜色
  const getRoleBadge = (role: string) => {
    if (role === "super_admin") {
      return <Badge className="bg-[#D32F2F]">超级管理员</Badge>;
    }
    return <Badge className="bg-[#1976D2]">用户</Badge>;
  };

  // 获取宝宝档案信息
  const getKidInfo = (userId: number) => {
    const kid = specialKids?.find((k) => k.userId === userId);
    if (!kid) return null;
    return {
      name: kid.name,
      stars: kid.stars,
      avatar: kid.avatar,
    };
  };

  // 开始编辑关系
  const handleStartEdit = (user: any) => {
    setEditingUserId(user.id);
    // 根据用户角色设置默认选中的关联用户
    if (user.role === 'baby' && user.familyId) {
      // 宝宝：查找对应的家长
      const parent = users?.find(u => u.role === 'parent' && u.familyId === user.familyId);
      setSelectedRelatedUserId(parent?.id || null);
    } else if (user.role === 'parent') {
      // 家长：默认不选中（因为可能有多个宝宝）
      setSelectedRelatedUserId(null);
    }
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (!editingUserId) return;
    const user = users?.find(u => u.id === editingUserId);
    if (!user) return;
    
    // 根据用户角色确定关系类型
    const relationType = user.role === 'baby' ? 'parent' : 'child';
    
    updateUserRelationMutation.mutate({
      userId: editingUserId,
      relatedUserId: selectedRelatedUserId,
      relationType,
    });
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingUserId(null);
    setSelectedRelatedUserId(null);
  };

  // 切换用户选中状态
  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedUserIds.length === users?.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users?.map((u) => u.id) || []);
    }
  };

  // 执行批量删除
  const handleBatchDelete = () => {
    if (selectedUserIds.length === 0) {
      toast.error("请至少选择一个用户");
      return;
    }
    setShowDeleteDialog(true);
  };

  // 确认删除
  const confirmDelete = () => {
    deleteUsersMutation.mutate({ userIds: selectedUserIds });
  };

  // 更新用户信息
  const updateUserInfoMutation = trpc.admin.updateUserInfo.useMutation({
    onSuccess: () => {
      toast.success("用户信息更新成功！");
      setEditingUserInfoId(null);
      setEditUsername("");
      setEditName("");
      // 使用invalidate强制清除缓存并重新查询
      utils.admin.getUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 开始编辑用户信息
  const handleEditUserInfo = (user: any) => {
    setEditingUserInfoId(user.id);
    setEditUsername(user.username || "");
    setEditName(user.name || "");
  };

  // 保存用户信息
  const handleSaveUserInfo = () => {
    if (!editingUserInfoId) return;
    updateUserInfoMutation.mutate({
      userId: editingUserInfoId,
      username: editUsername,
      name: editName,
    });
  };

  // 取消编辑用户信息
  const handleCancelEditUserInfo = () => {
    setEditingUserInfoId(null);
    setEditUsername("");
    setEditName("");
  };

  // 一键登录mutation
  const quickLoginMutation = trpc.auth.quickLogin.useMutation({
    onSuccess: (data) => {
      // 服务器端已经设置了cookie，直接刷新页面即可
      toast.success(`已登录为 ${data.user.name || data.user.username}，正在跳转...`);
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    },
    onError: (error) => {
      toast.error(error.message || "登录失败");
    },
  });

  // 一键登录
  const handleQuickLogin = (userId: number) => {
    if (confirm("确认要登录到该用户账户吗？")) {
      quickLoginMutation.mutate({ targetUserId: userId });
    }
  };

  // 功能权限管理相关
  const AVAILABLE_SUB_FEATURES: Record<string, Array<{name: string, description: string}>> = {
    "游戏": [
      { name: "记忆翻牌", description: "翻开卡片，找到相同的图案，锻炼记忆力！" },
      { name: "趣味拼图", description: "拖动碎片，拼出完整的图画，培养空间感！" },
      { name: "数学问答", description: "快速计算，挑战大脑，成为数学小天才！" },
      { name: "国际象棋", description: "与电脑对战，锻炼战略思维，成为棋艺大师！" },
      { name: "飞行棋", description: "经典四人飞行棋，掌握骰子，先到终点获胜！" },
      { name: "围棋", description: "古老的智慧游戏，黑白对弈，锻炼思维！" },
      { name: "五子棋", description: "简单有趣，先连成五子者获胜！" },
      { name: "反义词游戏", description: "找出词语的反义词，丰富词汇，提升语言能力！" },
      { name: "看图识字", description: "看图片，选汉字，快乐学习！" },
      { name: "快闪识字", description: "田字格展示，快速记忆汉字！" },
      { name: "听音识字", description: "听读音，选汉字，锻炼听力！" },
      { name: "翻牌记字", description: "翻牌配对，记忆汉字！" },
      { name: "🦷 牙齿保卫战", description: "跟着语音引导刷牙，养成好习惯！" },
      { name: "➕ 20加法", description: "简单加法练习，家长可调整难度和题量！" },
      { name: "📖 阅读识字", description: "点击文字就能朗读，还能生成专属故事内容！" },
      { name: "错题本", description: "查看和复习答错的题目" },
      { name: "游戏排行榜", description: "查看游戏最高分排行" },
    ],
    "健康": [
      { name: "体能训练", description: "体能锻炼计划和记录" },
      { name: "运动挑战", description: "各类运动挑战活动" },
      { name: "健康知识", description: "健康科普知识学习" },
    ],
    "知识": [
      { name: "动物世界", description: "探索神奇的动物世界" },
      { name: "植物花园", description: "发现美丽的植物花园" },
      { name: "太空探索", description: "探索神秘的宇宙太空" },
      { name: "科学实验", description: "进行有趣的科学实验" },
      { name: "历史故事", description: "学习有趣的历史故事" },
      { name: "艺术天地", description: "欣赏美丽的艺术作品" },
    ],
    "逻辑": [
      { name: "逻辑思维", description: "逻辑思维训练游戏" },
      { name: "编程启蒙", description: "编程思维启蒙课程" },
    ],
    "社交": [
      { name: "成长相册", description: "记录美好的成长瞬间" },
      { name: "社交PK", description: "与其他宝宝进行PK对战" },
      { name: "家庭排行榜", description: "查看家庭成员排行" },
    ],
    "家长": [
      { name: "宝贝档案", description: "管理宝宝信息" },
      { name: "宝贝词库", description: "管理宝宝的中英文词汇" },
      { name: "礼品兑换", description: "用星星兑换惊喜礼物，管理奖品" },
      { name: "成长报告", description: "查看学习统计" },
      { name: "家庭设置", description: "隐私和权限设置" },
    ],
    "首页": [
      { name: "宝宝头像添加", description: "允许家长添加和修改宝宝头像" },
    ],
  };

  // 获取当前管理的家长信息
  const managedParent = users?.find(u => u.id === featureManagementParentId);

  // 获取家庭的功能权限
  const { data: familyFeatures, refetch: refetchFeatures } = trpc.admin.getFamilyFeatures.useQuery(
    { familyId: managedParent?.familyId || 0 },
    { enabled: !!managedParent?.familyId }
  );

  const updateFeatureMutation = trpc.admin.updateFamilyFeature.useMutation({
    onSuccess: () => {
      refetchFeatures();
      toast.success("权限更新成功");
    },
    onError: () => {
      toast.error("权限更新失败");
    },
  });

  // 检查某个子功能是否已启用
  const isSubFeatureEnabled = (featureName: string, subFeatureName: string) => {
    return familyFeatures?.some(
      f => f.featureName === featureName && 
           f.subFeatureName === subFeatureName && 
           f.enabled
    ) || false;
  };

  // 切换子功能开关
  const toggleSubFeature = async (featureName: string, subFeatureName: string, enabled: boolean) => {
    if (!managedParent?.familyId) return;
    await updateFeatureMutation.mutateAsync({
      familyId: managedParent.familyId,
      featureName,
      subFeatureName,
      enabled,
    });
  };

  // 打开功能权限管理对话框
  const handleOpenFeatureManagement = (userId: number) => {
    setFeatureManagementParentId(userId);
    setSelectedFeature(null);
  };

  // 关闭功能权限管理对话框
  const handleCloseFeatureManagement = () => {
    setFeatureManagementParentId(null);
    setSelectedFeature(null);
  };

  return (
    <div className="space-y-6">
      {/* 说明卡片 */}
      <Card className="p-6 bg-gradient-to-br from-red-50 to-rose-50">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#D32F2F]" />
          账户体系说明
        </h3>
        <div className="space-y-2 text-sm text-gray-700">
          <p><strong>三级权限体系：</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><Badge className="bg-[#D32F2F] mr-2">超级管理员</Badge>拥有所有权限，可管理所有家庭和用户</li>
            <li><Badge className="bg-[#1976D2] mr-2">家长</Badge>可管理自己家庭的宝宝、词库、奖励等</li>
            <li><Badge className="bg-pink-500 mr-2">宝宝</Badge>只能使用游戏和学习功能</li>
          </ul>
          <p className="mt-4"><strong>登录状态判断：</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>用户通过用户名密码登录后，即为"已登录"状态</li>
            <li>登录后可以看到自己的角色（超级管理员/家长/宝宝）</li>
          </ul>
          <p className="mt-4"><strong>家庭归属判断：</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>家长和宝宝账户需要绑定到一个家庭（familyId字段）</li>
            <li>绑定家庭后，才能使用词库、奖励等家庭功能</li>
            <li>超级管理员不需要绑定家庭，可以管理所有家庭</li>
          </ul>
        </div>
      </Card>

      {/* 用户账户列表 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-[#D32F2F]" />
            用户账户列表
          </h3>
          <div className="flex items-center gap-2">
            {selectedUserIds.length > 0 && (
              <Badge variant="secondary">已选择 {selectedUserIds.length} 个</Badge>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBatchDelete}
              disabled={selectedUserIds.length === 0}
            >
              批量删除
            </Button>
          </div>
        </div>
        
        {/* 筛选和搜索工具栏 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
          {/* 角色筛选器 */}
          <div className="flex items-center gap-2 flex-1">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="筛选角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="parent">全部家长</SelectItem>
                <SelectItem value="baby">全部宝宝</SelectItem>
                <SelectItem value="super_admin">超级管理员</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* 关键词搜索 */}
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索用户名或姓名..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#A80000] text-sm"
            />
          </div>
        </div>
        {(() => {
          // 应用筛选和搜索逻辑
          let filteredUsers = users || [];
          
          // 角色筛选
          if (roleFilter !== "all") {
            filteredUsers = filteredUsers.filter(user => user.role === roleFilter);
          }
          
          // 关键词搜索
          if (searchKeyword.trim()) {
            const keyword = searchKeyword.toLowerCase().trim();
            filteredUsers = filteredUsers.filter(user => 
              (user.username?.toLowerCase().includes(keyword)) ||
              (user.name?.toLowerCase().includes(keyword))
            );
          }
          
          return filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUserIds.length === users?.length && users.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead className="text-center">编辑</TableHead>
                  <TableHead className="text-center">钱包功能</TableHead>
                  <TableHead className="text-center">功能权限</TableHead>
                  <TableHead className="text-center">VI配置</TableHead>
                  <TableHead className="text-center">一键登录</TableHead>
                  <TableHead className="text-center">删除</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const kidInfo = getKidInfo(user.id);
                  const isEditing = editingUserId === user.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                      </TableCell>
                      <TableCell>{user.id}</TableCell>
                      <TableCell className="font-medium">
                        {editingUserInfoId === user.id ? (
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="border rounded px-2 py-1 w-full text-sm"
                            placeholder="用户名"
                          />
                        ) : (
                          user.username || "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {editingUserInfoId === user.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="border rounded px-2 py-1 w-full text-sm"
                            placeholder="昵称"
                          />
                        ) : (
                          user.name || "-"
                        )}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      {/* 编辑列 */}
                      <TableCell className="text-center">
                        {editingUserInfoId === user.id ? (
                          <div className="flex justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleSaveUserInfo}
                              title="保存"
                            >
                              <Check className="w-4 h-4 text-[#4CAF50]" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEditUserInfo}
                              title="取消"
                            >
                              <X className="w-4 h-4 text-[#D32F2F]" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditUserInfo(user)}
                            title="编辑用户信息"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                      
                      {/* 钱包功能列 */}
                      <TableCell className="text-center">
                        {user.role === "parent" && (
                          <Switch
                            checked={user.walletEnabled === 1}
                            onCheckedChange={(checked) => {
                              toggleWalletMutation.mutate({
                                userId: user.id,
                                enabled: checked,
                              });
                            }}
                          />
                        )}
                      </TableCell>
                      
                      {/* 功能权限列 - 仅家长角色显示 */}
                      <TableCell className="text-center">
                        {user.role === "parent" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenFeatureManagement(user.id)}
                            title="功能权限"
                          >
                            <Settings className="w-4 h-4 text-[#D32F2F]" />
                          </Button>
                        )}
                      </TableCell>
                      
                      {/* VI配置列 - 仅家长角色显示 */}
                      <TableCell className="text-center">
                        {user.role === "parent" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setViConfigParentId(user.id)}
                            title="VI配置"
                          >
                            <Palette className="w-4 h-4 text-pink-500" />
                          </Button>
                        )}
                      </TableCell>
                      
                      {/* 一键登录列 */}
                      <TableCell className="text-center">
                        {user.role !== "super_admin" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleQuickLogin(user.id)}
                            title="一键登录"
                          >
                            <LogIn className="w-4 h-4 text-[#1976D2]" />
                          </Button>
                        )}
                      </TableCell>
                      
                      {/* 删除列 - 编辑关系按钮 */}
                      <TableCell className="text-center">
                        {user.role !== "super_admin" && (
                          <>
                            {isEditing ? (
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleSaveEdit}
                                  title="保存关系"
                                >
                                  <Check className="w-4 h-4 text-[#4CAF50]" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                  title="取消"
                                >
                                  <X className="w-4 h-4 text-[#D32F2F]" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStartEdit(user)}
                                title="编辑关系"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">暂无用户数据</p>
        );
        })()}
      </Card>
      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户？</AlertDialogTitle>
            <AlertDialogDescription>
              您即将删除 <strong>{selectedUserIds.length}</strong> 个用户账户。
              <br />
              <span className="text-[#D32F2F] font-semibold">此操作不可恢复，请谨慎操作！</span>
              <br />
              <br />
              将要删除的用户ID：{selectedUserIds.join(", ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-[#D32F2F] hover:bg-[#D32F2F]"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 功能权限管理对话框 - 使用新的树形组件 */}
      <Dialog open={featureManagementParentId !== null} onOpenChange={(open) => !open && handleCloseFeatureManagement()}>
        <DialogContent className="max-w-5xl h-[90vh] sm:h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              功能权限管理 - {managedParent?.name || '未命名'}
            </DialogTitle>
          </DialogHeader>
          
          {managedParent && managedParent.familyId && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 家长信息 */}
              <Card className="p-3 bg-gradient-to-r from-red-50 to-rose-50 mb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center">
                    <UserCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{managedParent.name || managedParent.username}</div>
                    <div className="text-sm text-muted-foreground">家庭 ID: {managedParent.familyId}</div>
                  </div>
                </div>
              </Card>

              {/* 使用新的树形权限管理组件 */}
              <div className="flex-1 overflow-hidden">
                <FeatureTreeManager 
                  familyId={managedParent.familyId} 
                  onClose={handleCloseFeatureManagement}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* VI配置对话框 */}
      <Dialog open={viConfigParentId !== null} onOpenChange={(open) => !open && setViConfigParentId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>VI配置 - {users?.find(u => u.id === viConfigParentId)?.name || '未命名'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="text-center p-8 bg-muted/30 rounded-lg">
              <Palette className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">等待VI方案上传</h3>
              <p className="text-sm text-muted-foreground">
                请上传完整的VI设计方案，包括主题色、Logo、字体等视觉元素。
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                功能框架已预留，等待填充具体配置选项。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
