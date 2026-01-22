import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface StarRewardPopupProps {
  open: boolean;
  onClose: () => void;
  stars: number;
  activityName: string;
  kidName?: string;
}

export function StarRewardPopup({ open, onClose, stars, activityName, kidName }: StarRewardPopupProps) {
  const [showStars, setShowStars] = useState(false);

  useEffect(() => {
    if (open) {
      // 延迟显示星星动画
      const timer = setTimeout(() => setShowStars(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowStars(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="text-center max-w-sm">
        <DialogTitle className="sr-only">获得奖励</DialogTitle>
        <div className="py-6">
          {/* 动画星星 */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center transition-transform duration-500 ${showStars ? 'scale-100' : 'scale-0'}`}>
              <Star className="w-12 h-12 text-white fill-white" />
            </div>
            
            {/* 装饰星星 */}
            {showStars && (
              <>
                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-400 animate-pulse" />
                <Sparkles className="absolute -bottom-2 -left-2 w-5 h-5 text-amber-400 animate-pulse delay-100" />
                <Sparkles className="absolute top-0 -left-4 w-4 h-4 text-amber-400 animate-pulse delay-200" />
              </>
            )}
          </div>

          {/* 奖励信息 */}
          <h2 className="text-xl font-bold mb-2 bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            获得奖励！
          </h2>
          
          <p className="text-muted-foreground mb-4">
            {kidName ? `${kidName}` : "你"}完成了「{activityName}」
          </p>

          {/* 星星数量 */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-3xl font-bold text-amber-500">+{stars}</span>
            <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
          </div>

          <Button onClick={onClose} className="btn-gradient w-full">
            太棒了！
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 用于在游戏中触发奖励的hook
export function useStarReward() {
  const [rewardState, setRewardState] = useState<{
    open: boolean;
    stars: number;
    activityName: string;
    kidName?: string;
  }>({
    open: false,
    stars: 0,
    activityName: "",
    kidName: undefined,
  });

  const showReward = (stars: number, activityName: string, kidName?: string) => {
    setRewardState({
      open: true,
      stars,
      activityName,
      kidName,
    });
  };

  const closeReward = () => {
    setRewardState(prev => ({ ...prev, open: false }));
  };

  return {
    rewardState,
    showReward,
    closeReward,
    RewardPopup: () => (
      <StarRewardPopup
        open={rewardState.open}
        onClose={closeReward}
        stars={rewardState.stars}
        activityName={rewardState.activityName}
        kidName={rewardState.kidName}
      />
    ),
  };
}
