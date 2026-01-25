import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { 
  Gamepad2, 
  BookOpen, 
  Images, 
  Trophy, 
  User, 
  LogOut,
  Sparkles,
  Star,
  Settings,
  UserPlus,
  ShoppingBag,
  Heart,
  Lightbulb,
  Brain,
  Users,
  ChevronDown,
  Home as HomeIcon,
  Search,
  MessageCircle,
  Activity
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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

const defaultFeatures = [
  {
    id: "games",
    title: "游戏",
    description: "游戏",
    icon: Gamepad2,
    emoji: "🎮",
    href: "/games",
    gradient: "from-purple-400 to-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    id: "health",
    title: "健康",
    description: "健康",
    icon: Heart,
    emoji: "❤️",
    href: "/health",
    gradient: "from-red-400 to-red-600",
    bgColor: "bg-red-50",
  },
  {
    id: "knowledge",
    title: "知识",
    description: "知识",
    icon: BookOpen,
    emoji: "📖",
    href: "/knowledge",
    gradient: "from-blue-400 to-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    id: "logic",
    title: "逻辑",
    description: "逻辑",
    icon: Brain,
    emoji: "🧠",
    href: "/logic",
    gradient: "from-green-400 to-green-600",
    bgColor: "bg-green-50",
    comingSoon: true,
  },
  {
    id: "social",
    title: "社交",
    description: "社交",
    icon: Users,
    emoji: "👥",
    href: "/social",
    gradient: "from-pink-400 to-pink-600",
  },
  {
    id: "parent",
    title: "家长",
    description: "家长",
    icon: User,
    emoji: "👨‍👩‍👧",
    href: "/parent",
    gradient: "from-amber-400 to-amber-600",
    bgColor: "bg-amber-50",
  },
];

// 可拖拽的功能卡片组件
function SortableFeatureCard({ feature, isAuthenticated, hasHeartbeat }: { feature: typeof defaultFeatures[0]; isAuthenticated: boolean; hasHeartbeat?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cardContent = (
    <Card 
      className={`card-hover p-4 sm:p-6 h-full ${feature.bgColor} border-0 ${isDragging ? 'shadow-2xl' : ''} ${isAuthenticated ? 'cursor-move' : ''} ${hasHeartbeat ? 'heartbeat-animation' : ''}`}
    >
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg`}>
        <span className="text-2xl sm:text-3xl">{feature.emoji}</span>
      </div>
      <h3 className="font-bold text-base sm:text-lg mb-1">{feature.title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground">{feature.description}</p>
    </Card>
  );

  if (feature.comingSoon) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...(isAuthenticated ? { ...attributes, ...listeners } : {})}
        onClick={() => toast.info('功能即将上线，敬请期待！')}
        className="opacity-75 cursor-pointer"
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isAuthenticated ? { ...attributes, ...listeners } : {})}
    >
      <Link href={feature.href}>
        {cardContent}
      </Link>
    </div>
  );
}

// 默认头像组件
function DefaultAvatar({ name, gradient }: { name: string; gradient: string }) {
  return (
    <div className={`w-full h-full rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-2xl sm:text-3xl font-bold`}>
      {name[0]}
    </div>
  );
}

// 五角星显示组件
function StarDisplay({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mt-2">
      <Star className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 fill-amber-400" />
      <span className="font-bold text-lg sm:text-xl text-amber-500">{count}</span>
    </div>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const initMutation = trpc.init.setup.useMutation();
  // 只有登录用户才查询宝宝数据
  // 家长账户：查询管理的宝宝列表
  // 宝宝账户：查询自己的信息（不传forManagement参数）
  const { data: specialKids, refetch: refetchKids } = trpc.specialKids.list.useQuery(
    user?.role === 'parent' ? { forManagement: true } : {},
    { enabled: isAuthenticated } // 只有登录后才查询
  );
  
  // 一键切换账户
  const quickLoginMutation = trpc.auth.quickLogin.useMutation({
    onSuccess: () => {
      // 切换成功后刷新页面
      window.location.reload();
    },
    onError: (error) => {
      toast.error("切换账户失败：" + error.message);
    },
  });
  
  // 宝宝切换回家长（需要密码验证）
  const switchToParentMutation = trpc.auth.quickLogin.useMutation({
    onSuccess: () => {
      setShowPasswordDialog(false);
      setParentPassword("");
      toast.success("切换成功！");
      // 切换成功后刷新页面
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error.message || "切换失败");
    },
  });
  
  // 处理宝宝切换回家长
  const handleSwitchToParent = () => {
    if (!parentPassword.trim()) {
      toast.error("请输入家长密码");
      return;
    }
    
    if (!parentUserId) {
      toast.error("未找到家长账户");
      return;
    }
    
    switchToParentMutation.mutate({
      targetUserId: parentUserId,
      password: parentPassword,
    });
  };
  
  // 获取横幅配置
  const { data: banner } = trpc.homeBanner.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  

  
  // 宝宝切换回家长的密码输入对话框
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [parentPassword, setParentPassword] = useState("");
  const [parentUserId, setParentUserId] = useState<number | null>(null);
  
  // 卡片排序状态
  const [features, setFeatures] = useState(defaultFeatures);
  
  // 心跳特效状态
  const [heartbeatIndex, setHeartbeatIndex] = useState<number | null>(null);
  
  // 获取用户保存的卡片排序
  const { data: savedOrder } = trpc.userPreferences.getHomeCardOrder.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  
  // 保存卡片排序的mutation
  const saveOrderMutation = trpc.userPreferences.saveHomeCardOrder.useMutation();
  
  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setFeatures((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // 保存到云端
        if (isAuthenticated) {
          const cardOrder = newOrder.map(f => f.id);
          saveOrderMutation.mutate({ cardOrder });
        }
        
        return newOrder;
      });
    }
  };
  
  // 当从云端加载到排序时,重新排列卡片
  useEffect(() => {
    if (savedOrder && savedOrder.length > 0) {
      const orderedFeatures = [...defaultFeatures].sort((a, b) => {
        const indexA = savedOrder.indexOf(a.id);
        const indexB = savedOrder.indexOf(b.id);
        // 如果ID不在保存的排序中,放到最后
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
      setFeatures(orderedFeatures);
    }
  }, [savedOrder]);

  // 初始化默认数据
  useEffect(() => {
    initMutation.mutate();
  }, []);
  
  // 心跳特效定时器
  useEffect(() => {
    const interval = setInterval(() => {
      // 随机选择一个卡片
      const randomIndex = Math.floor(Math.random() * features.length);
      setHeartbeatIndex(randomIndex);
      
      // 600ms 后恢复（心跳动画时长）
      setTimeout(() => {
        setHeartbeatIndex(null);
      }, 600);
    }, 1000); // 每 1 秒触发一次
    
    return () => clearInterval(interval);
  }, [features.length]);



  // 获取实际的宝宝列表（按position排序）
  const actualKids = specialKids ? [...specialKids].sort((a, b) => {
    const posOrder = { left: 0, right: 1 };
    return (posOrder[a.position as keyof typeof posOrder] || 999) - (posOrder[b.position as keyof typeof posOrder] || 999);
  }) : [];
  
  // 检查是否有宝宝
  const hasKids = actualKids.length > 0;
  
  // 如果没有宝宝且是家长角色，显示添加宝宝提示
  const isParent = user?.role === "parent";

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          {/* 左上角 Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/logo-header-transparent.png" 
              alt="脉动" 
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2 sm:gap-3">
                {/* 用户信息显示 - 家长账户显示下拉菜单 */}
                {user?.role === 'parent' && specialKids && specialKids.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <span className="font-medium text-sm">{user?.name || user?.username}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          家长
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        切换到宝宝账户
                      </div>
                      {specialKids.map((kid) => (
                        <DropdownMenuItem
                          key={kid.id}
                          onClick={() => quickLoginMutation.mutate({ targetUserId: kid.userId })}
                          disabled={quickLoginMutation.isPending}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${
                              kid.position === 'left' ? 'from-pink-400 to-pink-600' : 'from-blue-400 to-blue-600'
                            } flex items-center justify-center text-white text-xs font-bold`}>
                              {kid.name[0]}
                            </div>
                            <span>{kid.name}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                      <div className="my-1 h-px bg-border" />
                      <DropdownMenuItem
                        onClick={() => logout()}
                        className="text-red-600 dark:text-red-400"
                      >
                        <div className="flex items-center gap-2">
                          <LogOut className="w-4 h-4" />
                          <span>退出登录</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : user?.role === 'baby' && specialKids && specialKids.length > 0 && specialKids[0].parentUserId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <span className="font-medium text-sm">{user?.name || user?.username}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                          宝宝
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          setParentUserId(specialKids[0].parentUserId);
                          setShowPasswordDialog(true);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-4 h-4" />
                          <span>切换回家长</span>
                        </div>
                      </DropdownMenuItem>
                      <div className="my-1 h-px bg-border" />
                      <DropdownMenuItem
                        onClick={() => logout()}
                        className="text-red-600 dark:text-red-400"
                      >
                        <div className="flex items-center gap-2">
                          <LogOut className="w-4 h-4" />
                          <span>退出登录</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                    <span className="font-medium text-sm">{user?.name || user?.username}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      user?.role === 'super_admin' 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        : user?.role === 'parent'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                    }`}>
                      {user?.role === 'super_admin' ? '超级管理员' : user?.role === 'parent' ? '家长' : '宝宝'}
                    </span>
                  </div>
                )}
                
                {/* 管理员入口 */}
                {user?.role === "super_admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="gap-1">
                      <Settings className="w-4 h-4" />
                      <span className="hidden sm:inline">管理</span>
                    </Button>
                  </Link>
                )}
                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="gap-1">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">个人中心</span>
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => logout()}
                  className="text-muted-foreground"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">登录</Button>
                </Link>
                <Link href="/login">
                  <Button className="btn-gradient" size="sm">
                    <UserPlus className="w-4 h-4 mr-1" />
                    注册
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container py-6 sm:py-8">
        {/* 宝宝头像展示区 - 只有当有宝宝时才显示 */}
        {hasKids && (
        <section className="mb-8">
          <div className={`flex items-center justify-center gap-6 sm:gap-12 ${
            actualKids.length === 1 ? 'flex-col sm:flex-row' : ''
          }`}>
            {actualKids.map((kid, index) => {
              const gradients = [
                { border: 'border-purple-500', borderHover: 'border-purple-400', borderLight: 'border-purple-200', text: 'text-purple-600', gradient: 'from-purple-400 to-pink-400', shadow: 'shadow-purple-500/30' },
                { border: 'border-blue-500', borderHover: 'border-blue-400', borderLight: 'border-blue-200', text: 'text-blue-600', gradient: 'from-blue-400 to-cyan-400', shadow: 'shadow-blue-500/30' },
              ];
              const colors = gradients[index % gradients.length];
              
              return (
                <div key={kid.id} className="flex items-center gap-4">
                  {/* 中间分隔线 - 只在两个宝宝时显示 */}
                  {index === 1 && actualKids.length === 2 && (
                    <div className="flex flex-col items-center justify-center px-4">
                      <div className="w-0.5 h-24 sm:h-32 bg-gradient-to-b from-purple-300 via-amber-400 to-blue-300 rounded-full shadow-md"></div>
                      <span className="text-xs sm:text-sm font-bold text-amber-500 mt-3">VS</span>
                    </div>
                  )}
                  
                  <div className="flex flex-col items-center">
                    <div className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 ${colors.borderLight}`}>
                      {kid.avatar ? (
                        <img 
                          src={kid.avatar} 
                          alt={kid.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <DefaultAvatar name={kid.name} gradient={colors.gradient} />
                      )}
                    </div>
                    <h3 className={`font-bold text-base sm:text-lg mt-2 ${colors.text}`}>
                      {kid.name}
                    </h3>
                    <StarDisplay count={kid.stars || 0} />
                  </div>
                </div>
              );
            })}
          </div>



        </section>
        )}



        {/* 功能卡片 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={features.map(f => f.id)}
            strategy={rectSortingStrategy}
          >
            <section className="grid grid-cols-3 gap-4 sm:gap-6 mb-8">
              {features.map((feature, index) => (
                <SortableFeatureCard
                  key={feature.id}
                  feature={feature}
                  isAuthenticated={isAuthenticated}
                  hasHeartbeat={heartbeatIndex === index}
                />
              ))}
            </section>
          </SortableContext>
        </DndContext>

        {/* 底部装饰 */}
        <div className="text-center text-sm text-muted-foreground">
          <p>用爱与创意，陪伴每一天的成长 💜</p>
        </div>
      </main>

      {/* 底部导航（移动端） */}
      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border/50 sm:hidden">
        <div className="flex justify-around py-2">
          {/* 首页 */}
          <Link href="/">
            <div className="nav-item">
              <HomeIcon className="w-6 h-6" />
              <span className="text-xs">首页</span>
            </div>
          </Link>
          
          {/* 账本 */}
          <div 
            className="nav-item cursor-pointer" 
            onClick={() => window.location.href = "/ledger";
          >
            <BookOpen className="w-6 h-6" />
            <span className="text-xs">账本</span>
          </div>
          
          {/* 消息 */}
          <div 
            className="nav-item cursor-pointer" 
            onClick={() => toast.info('功能开发中，敬请期待！')}
          >
            <MessageCircle className="w-6 h-6" />
            <span className="text-xs">消息</span>
          </div>
          
          {/* 动态 */}
          <div 
            className="nav-item cursor-pointer" 
            onClick={() => toast.info('功能开发中，敬请期待！')}
          >
            <Activity className="w-6 h-6" />
            <span className="text-xs">动态</span>
          </div>
          
          {/* 我的 */}
          <div 
            className="nav-item cursor-pointer" 
            onClick={() => toast.info('功能开发中，敬请期待！')}
          >
            <User className="w-6 h-6" />
            <span className="text-xs">我的</span>
          </div>
        </div>
      </nav>


      
      {/* 宝宝切换回家长的密码输入对话框 */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>切换回家长账户</DialogTitle>
            <DialogDescription>
              请输入家长登录密码以验证身份
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="parent-password">家长密码</Label>
              <Input
                id="parent-password"
                type="password"
                placeholder="请输入家长密码"
                value={parentPassword}
                onChange={(e) => setParentPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSwitchToParent();
                  }
                }}
                disabled={switchToParentMutation.isPending}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasswordDialog(false);
                  setParentPassword("");
                }}
                disabled={switchToParentMutation.isPending}
              >
                取消
              </Button>
              <Button
                onClick={handleSwitchToParent}
                disabled={switchToParentMutation.isPending}
              >
                {switchToParentMutation.isPending ? "切换中..." : "确认切换"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
