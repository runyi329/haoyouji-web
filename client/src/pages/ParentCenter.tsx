import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { trpc } from "@/lib/trpc";
import { ShoppingBag, Settings, BarChart3, User, ArrowLeft, Star, BookOpen, Users } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useFamilyFeatures } from "@/hooks/useFamilyFeatures";


export default function ParentCenter() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isFeatureEnabled } = useFamilyFeatures();
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);

  
  // 检查各个功能是否开启
  const canAccessGiftExchange = user?.role === 'super_admin' || isFeatureEnabled("家长", "礼品兑换");
  const canAccessKidsProfile = user?.role === 'super_admin' || isFeatureEnabled("家长", "宝贝档案");
  const canAccessVocabulary = user?.role === 'super_admin' || isFeatureEnabled("家长", "宝贝词库");
  
  const { data: specialKids, refetch: refetchKids } = trpc.specialKids.list.useQuery();
  const { data: rewards } = trpc.rewards.list.useQuery();
  const redeemMutation = trpc.rewards.redeemWithStars.useMutation();

  const utils = trpc.useUtils();

  // 从localStorage读取选中的孩子
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    } else if (specialKids && specialKids.length > 0) {
      // 如果没有选中的孩子，默认选中第一个
      setSelectedKidId(specialKids[0].id);
    }
  }, [specialKids]);

  // 获取选中孩子的信息
  const selectedKid = specialKids?.find(kid => kid.id === selectedKidId);

  // 兑换奖品
  const handleRedeem = async (rewardId: number, cost: number) => {
    if (!selectedKidId) {
      alert("请先选择一个宝宝");
      return;
    }

    if (!selectedKid || selectedKid.stars < cost) {
      alert("星星不足，无法兑换");
      return;
    }

    try {
      await redeemMutation.mutateAsync({ kidId: selectedKidId, rewardId });
      alert("兑换成功！");
      utils.specialKids.list.invalidate();
    } catch (error) {
      alert("兑换失败，请重试");
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回首页</span>
          </button>
          <h1 className="text-xl font-bold">家长中心</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 宝宝信息卡片 - 显示所有孩子 */}
      {specialKids && specialKids.length > 0 && (
        <div className="container mx-auto px-4 py-4">
          <div className="flex gap-2 justify-center flex-wrap">
            {specialKids.map((kid) => (
              <Card 
                key={kid.id}
                className={`p-2 w-[100px] cursor-pointer transition-all ${
                  selectedKidId === kid.id 
                    ? 'bg-gradient-to-r from-amber-100 to-orange-100 border-2 border-amber-400' 
                    : 'bg-white hover:shadow-md'
                }`}
                onClick={() => {
                  setSelectedKidId(kid.id);
                  localStorage.setItem("selectedKidId", kid.id.toString());
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-lg flex-shrink-0">
                    {kid.avatar ? (
                      <img src={kid.avatar} alt={kid.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white text-base font-bold">
                        {kid.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="text-center w-full">
                    <h3 className="text-sm font-bold mb-0.5 truncate">{kid.name}</h3>
                    <div className="flex items-center justify-center gap-0.5">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-semibold text-amber-600">{kid.stars}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 主要内容 */}
      <div className="container mx-auto px-4">
        <Tabs defaultValue={canAccessGiftExchange ? "shop" : "manage"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            {canAccessGiftExchange && (
              <TabsTrigger value="shop" className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                星星商城
              </TabsTrigger>
            )}
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              管理中心
            </TabsTrigger>
          </TabsList>

          {/* 星星商城 - 根据权限显示 */}
          {canAccessGiftExchange && (
            <TabsContent value="shop">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards?.map((reward) => (
                <Card key={reward.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col items-center text-center">
                    {reward.icon && reward.icon.startsWith('http') ? (
                      <img src={reward.icon} alt={reward.name} className="w-24 h-24 object-contain mb-4" />
                    ) : (
                      <div className="text-6xl mb-4">{reward.icon || '🎁'}</div>
                    )}
                    <h3 className="font-bold text-lg mb-2">{reward.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{reward.description}</p>
                    <div className="flex items-center gap-2 mb-4">
                      <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                      <span className="font-bold text-amber-600">{reward.pointsCost} 颗星星</span>
                    </div>
                    <Button
                      onClick={() => handleRedeem(reward.id, reward.pointsCost)}
                      disabled={!selectedKid || selectedKid.stars < reward.pointsCost}
                      className="w-full"
                    >
                      {!selectedKid ? "请先选择宝宝" : selectedKid.stars < reward.pointsCost ? "星星不足" : "立即兑换"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            {(!rewards || rewards.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                暂无可兑换的奖品
              </div>
            )}
            </TabsContent>
          )}

          {/* 管理中心 */}
          <TabsContent value="manage">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canAccessKidsProfile && (
                <Link href="/parent/kids">
                  <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">宝贝档案</h3>
                        <p className="text-sm text-muted-foreground">管理宝宝信息</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              )}

              {canAccessGiftExchange && (
                <Link href="/parent/rewards">
                  <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">奖品管理</h3>
                        <p className="text-sm text-muted-foreground">添加和编辑奖品</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              )}

              {canAccessVocabulary && (
                <Link href="/parent/vocabulary">
                  <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">宝宝词库</h3>
                        <p className="text-sm text-muted-foreground">管理中英文词汇</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              )}

              <Link href="/parent/contacts">
                <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <Users className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">人脉管理</h3>
                      <p className="text-sm text-muted-foreground">管理社交网络关系</p>
                    </div>
                  </div>
                </Card>
              </Link>

              <Card className="p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">成长报告</h3>
                    <p className="text-sm text-muted-foreground">查看学习统计（即将上线）</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Settings className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">家庭设置</h3>
                    <p className="text-sm text-muted-foreground">隐私和权限设置（即将上线）</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>


    </div>
  );
}
