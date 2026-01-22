import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ArrowLeft, Star, ShoppingBag, Gift, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function StarShop() {
  const { data: items, isLoading } = trpc.rewards.list.useQuery();
  const { data: specialKids, refetch: refetchKids } = trpc.specialKids.list.useQuery();
  const redeemMutation = trpc.rewards.redeemWithStars.useMutation();
  
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [confirmItem, setConfirmItem] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [redeemedItemName, setRedeemedItemName] = useState("");

  // 从localStorage读取选择的孩子
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
  }, []);

  // 获取当前选择的孩子
  const currentKid = specialKids?.find(k => k.id === selectedKidId);
  const miaoMiao = specialKids?.find(k => k.position === "left");
  const wangWang = specialKids?.find(k => k.position === "right");

  // 兑换商品
  const handleRedeem = async () => {
    if (!selectedKidId || !confirmItem) return;
    
    try {
      const result = await redeemMutation.mutateAsync({
        kidId: selectedKidId,
        rewardId: confirmItem.id,
      });
      
      setRedeemedItemName(result.itemName);
      setConfirmItem(null);
      setShowSuccess(true);
      refetchKids();
    } catch (error: any) {
      toast.error(error.message || "兑换失败");
    }
  };

  // 选择孩子
  const selectKid = (kidId: number) => {
    setSelectedKidId(kidId);
    localStorage.setItem("selectedKidId", kidId.toString());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-8">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center h-14">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg ml-2">星星商城</h1>
          <div className="ml-auto flex items-center gap-1 text-amber-500">
            <Star className="w-5 h-5 fill-current" />
            <span className="font-bold">{currentKid?.stars || 0}</span>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* 选择孩子 */}
        <section className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">选择小朋友</h2>
          <div className="flex gap-4">
            {/* 喵喵 */}
            <div 
              className={`flex-1 p-4 rounded-2xl cursor-pointer transition-all ${selectedKidId === miaoMiao?.id ? 'bg-purple-100 border-2 border-purple-400' : 'bg-muted/50 border-2 border-transparent'}`}
              onClick={() => miaoMiao && selectKid(miaoMiao.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-purple-300">
                  {miaoMiao?.avatar ? (
                    <img src={miaoMiao.avatar} alt={miaoMiao.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                      {miaoMiao?.name?.[0] || "喵"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium">{miaoMiao?.name || "喵喵"}</div>
                  <div className="flex items-center gap-1 text-sm text-amber-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{miaoMiao?.stars || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 旺旺 */}
            <div 
              className={`flex-1 p-4 rounded-2xl cursor-pointer transition-all ${selectedKidId === wangWang?.id ? 'bg-blue-100 border-2 border-blue-400' : 'bg-muted/50 border-2 border-transparent'}`}
              onClick={() => wangWang && selectKid(wangWang.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-blue-300">
                  {wangWang?.avatar ? (
                    <img src={wangWang.avatar} alt={wangWang.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold">
                      {wangWang?.name?.[0] || "旺"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium">{wangWang?.name || "旺旺"}</div>
                  <div className="flex items-center gap-1 text-sm text-amber-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{wangWang?.stars || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 商品列表 */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">可兑换礼物</h2>
          
          {items && items.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {items.map((item) => {
                const canAfford = currentKid && currentKid.stars >= item.pointsCost;
                
                return (
                  <Card key={item.id} className="overflow-hidden">
                    {/* 商品图片 */}
                    <div className="aspect-square bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center">
                      {item.icon ? (
                        <img src={item.icon} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Gift className="w-16 h-16 text-amber-400" />
                      )}
                    </div>
                    
                    {/* 商品信息 */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm mb-1 truncate">{item.name}</h3>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{item.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-amber-500">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="font-bold">{item.pointsCost}</span>
                        </div>
                        
                        <Button 
                          size="sm" 
                          disabled={!selectedKidId || !canAfford}
                          onClick={() => setConfirmItem(item)}
                          className={canAfford ? "btn-gradient" : ""}
                        >
                          兑换
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">暂无可兑换的礼物</p>
              <p className="text-sm text-muted-foreground mt-1">管理员可以在后台添加礼物</p>
            </div>
          )}
        </section>
      </main>

      {/* 确认兑换弹窗 */}
      <Dialog open={!!confirmItem} onOpenChange={() => setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认兑换</DialogTitle>
            <DialogDescription>              {currentKid?.name}要用 {confirmItem?.pointsCost} 颗星星兑换「{confirmItem?.name}」吗?？
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-4">
            <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
            <span className="text-2xl font-bold text-amber-500">{confirmItem?.pointsCost}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmItem(null)}>取消</Button>
            <Button onClick={handleRedeem} disabled={redeemMutation.isPending} className="btn-gradient">
              {redeemMutation.isPending ? "兑换中..." : "确认兑换"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 兑换成功弹窗 */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="text-center">
          <div className="py-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center animate-bounce">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">兑换成功！</h2>
            <p className="text-muted-foreground">
              恭喜 {currentKid?.name} 获得「{redeemedItemName}」
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              请找爸爸妈妈领取奖励哦~
            </p>
          </div>
          <Button onClick={() => setShowSuccess(false)} className="btn-gradient">
            太棒了！
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
