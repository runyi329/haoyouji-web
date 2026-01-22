import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Gamepad2, Heart, BookOpen, Brain, Users, User, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// 定义所有可用的子功能
const AVAILABLE_SUB_FEATURES = {
  "游戏": [
    { name: "记忆翻牌", description: "翻开卡片，找到相同的图案，锻炼记忆力！" },
    { name: "趣味拼图", description: "拖动碎片，拼出完整的图画，培养空间感！" },
    { name: "数学问答", description: "快速计算，挑战大脑，成为数学小天才！" },
    { name: "国际象棋", description: "与电脑对战，锻炼战略思维，成为棋艺大师！" },
    { name: "飞行棋", description: "经典四人飞行棋，掌揘骰子，先到终点获胜！" },
    { name: "围棋", description: "古老的智慧游戏，黑白对弈，锻炼思维！" },
    { name: "五子棋", description: "简单有趣，先连成五子者获胜！" },
    { name: "反义词游戏", description: "找出词语的反义词，丰富词汇，提升语言能力！" },
    { name: "识字游戏", description: "快乐学习汉字！" },
    { name: "🦷 牙齿保卫战", description: "跟着语音引导刷牙，养成好习惯！" },
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
    { name: "礼品兑换", description: "用星星兑换惊喜礼物，管理奖品" },
    { name: "宝贝档案", description: "管理宝宝信息" },
    { name: "成长报告", description: "查看学习统计" },
    { name: "家庭设置", description: "隐私和权限设置" },
  ],
  "首页": [
    { name: "宝宝头像添加", description: "允许家长添加和修改宝宝头像" },
  ],
};

const FEATURE_ICONS: Record<string, any> = {
  "游戏": Gamepad2,
  "健康": Heart,
  "知识": BookOpen,
  "逻辑": Brain,
  "社交": Users,
  "家长": User,
  "首页": BookOpen,
};

const FEATURE_COLORS: Record<string, string> = {
  "游戏": "from-purple-400 to-purple-600",
  "健康": "from-red-400 to-red-600",
  "知识": "from-blue-400 to-blue-600",
  "逻辑": "from-green-400 to-green-600",
  "社交": "from-pink-400 to-pink-600",
  "家长": "from-amber-400 to-amber-600",
  "首页": "from-indigo-400 to-indigo-600",
};

export default function ParentFeatureManagement() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/parent-management/:parentId");
  const { user } = useAuth();
  const parentId = params?.parentId ? parseInt(params.parentId) : null;
  
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  
  // 获取家长信息
  const { data: parents } = trpc.admin.getAllParents.useQuery();
  const parent = parents?.find(p => p.id === parentId);
  
  // 获取家庭的功能权限
  const { data: familyFeatures, refetch } = trpc.admin.getFamilyFeatures.useQuery(
    { familyId: parent?.familyId || 0 },
    { enabled: !!parent?.familyId }
  );
  
  const updateFeatureMutation = trpc.admin.updateFamilyFeature.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("权限更新成功");
    },
    onError: () => {
      toast.error("权限更新失败");
    },
  });

  // 检查权限
  if (user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">权限不足</h2>
          <p className="text-muted-foreground mb-4">只有超级管理员可以访问此页面</p>
          <Button onClick={() => navigate("/")}>返回首页</Button>
        </Card>
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">家长不存在</h2>
          <Button onClick={() => navigate("/parent-management")}>返回列表</Button>
        </Card>
      </div>
    );
  }

  if (!parent.familyId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">该家长没有关联家庭</h2>
          <p className="text-muted-foreground mb-4">请先为该家长创建或关联家庭</p>
          <Button onClick={() => navigate("/parent-management")}>返回列表</Button>
        </Card>
      </div>
    );
  }

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
    await updateFeatureMutation.mutateAsync({
      familyId: parent.familyId!,
      featureName,
      subFeatureName,
      enabled,
    });
  };

  // 如果选中了某个主功能，显示子功能列表
  if (selectedFeature) {
    const subFeatures = AVAILABLE_SUB_FEATURES[selectedFeature as keyof typeof AVAILABLE_SUB_FEATURES] || [];
    const Icon = FEATURE_ICONS[selectedFeature];
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 pb-20">
        {/* 顶部导航 */}
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={() => setSelectedFeature(null)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>返回</span>
            </button>
            <h1 className="text-xl font-bold">{selectedFeature} - 子功能管理</h1>
            <div className="w-20"></div>
          </div>
        </div>

        {/* 主要内容 */}
        <div className="container mx-auto px-4 py-6">
          <Card className="p-6 mb-6 bg-gradient-to-r from-blue-100 to-purple-100 border-0">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${FEATURE_COLORS[selectedFeature]} flex items-center justify-center shadow-lg`}>
                <Icon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{parent.name || parent.username}</h2>
                <p className="text-muted-foreground">家庭ID: {parent.familyId}</p>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            {subFeatures.map((subFeature) => {
              const enabled = isSubFeatureEnabled(selectedFeature, subFeature.name);
              
              return (
                <Card key={subFeature.name} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-1">{subFeature.name}</h3>
                      <p className="text-sm text-muted-foreground">{subFeature.description}</p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => toggleSubFeature(selectedFeature, subFeature.name, checked)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 显示6个主功能
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/parent-management")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回列表</span>
          </button>
          <h1 className="text-xl font-bold">功能权限管理</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-100 to-purple-100 border-0">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{parent.name || parent.username}</h2>
              <p className="text-muted-foreground">家庭ID: {parent.familyId}</p>
            </div>
          </div>
        </Card>

        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">选择主功能</h2>
          <p className="text-muted-foreground">点击主功能卡片管理其子功能开关</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.keys(AVAILABLE_SUB_FEATURES).map((featureName) => {
            const Icon = FEATURE_ICONS[featureName];
            const gradient = FEATURE_COLORS[featureName];
            const subFeatures = AVAILABLE_SUB_FEATURES[featureName as keyof typeof AVAILABLE_SUB_FEATURES];
            const enabledCount = subFeatures.filter(sf => 
              isSubFeatureEnabled(featureName, sf.name)
            ).length;
            
            return (
              <Card
                key={featureName}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedFeature(featureName)}
              >
                <div className="flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{featureName}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {enabledCount} / {subFeatures.length} 已开通
                  </p>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
