import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Upload, Trophy, Target, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { storagePut } from "@/lib/storage";
import { compressFileImage } from "@/utils/imageUtils";

interface ChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kidId: number;
  kidName: string;
  onSuccess: () => void;
}

export default function ChallengeDialog({ open, onOpenChange, kidId, kidName, onSuccess }: ChallengeDialogProps) {
  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardImageUrl, setRewardImageUrl] = useState("");
  const [rewardFileKey, setRewardFileKey] = useState("");
  const [targetCorrectCount, setTargetCorrectCount] = useState(50);
  const [penaltyPerWrong, setPenaltyPerWrong] = useState(1);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"setup" | "verify">("setup");

  const createChallengeMutation = trpc.addition20.createChallenge.useMutation({
    onSuccess: () => {
      toast.success("有奖挑战创建成功！");
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "创建失败");
    },
  });

  const verifyPasswordMutation = trpc.addition20.verifyParentPassword.useMutation({
    onSuccess: () => {
      // 密码验证成功，创建挑战
      createChallengeMutation.mutate({
        kidId,
        targetCorrectCount,
        penaltyPerWrong,
        rewardTitle,
        rewardImageUrl,
        rewardFileKey,
      });
    },
    onError: (error) => {
      toast.error(error.message || "密码验证失败");
    },
  });

  const resetForm = () => {
    setRewardTitle("");
    setRewardImageUrl("");
    setRewardFileKey("");
    setTargetCorrectCount(50);
    setPenaltyPerWrong(1);
    setPassword("");
    setStep("setup");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过5MB");
      return;
    }

    setUploading(true);
    try {
      // 自动压缩图片
      const compressedFile = await compressFileImage(file, 'thumbnail');
      const { url, fileKey } = await storagePut(compressedFile, `challenges/${kidId}`);
      setRewardImageUrl(url);
      setRewardFileKey(fileKey);
      toast.success("图片上传成功");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (!rewardTitle.trim()) {
      toast.error("请输入奖品名称");
      return;
    }
    if (targetCorrectCount < 10) {
      toast.error("目标题数不能少于10题");
      return;
    }
    setStep("verify");
  };

  const handleSubmit = () => {
    if (!password) {
      toast.error("请输入家长密码");
      return;
    }
    verifyPasswordMutation.mutate({ password });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            {step === "setup" ? "设置有奖挑战" : "家长密码验证"}
          </DialogTitle>
          <DialogDescription>
            {step === "setup" 
              ? `为${kidName}设置挑战目标和奖品`
              : "请输入家长密码以确认创建挑战"}
          </DialogDescription>
        </DialogHeader>

        {step === "setup" ? (
          <div className="space-y-6 py-4">
            {/* 奖品名称 */}
            <div className="space-y-2">
              <Label htmlFor="rewardTitle">奖品名称 *</Label>
              <Input
                id="rewardTitle"
                placeholder="例如：去游乐场、买玩具、吃大餐"
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* 奖品图片 */}
            <div className="space-y-2">
              <Label>奖品图片（可选）</Label>
              <div className="flex items-center gap-4">
                {rewardImageUrl ? (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-primary">
                    <img src={rewardImageUrl} alt="奖品" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploading ? "上传中..." : "支持JPG、PNG，最大5MB"}
                  </p>
                </div>
              </div>
            </div>

            {/* 目标题数 */}
            <div className="space-y-2">
              <Label>累计答对题数 *</Label>
              <div className="text-center mb-2">
                <span className="text-3xl font-bold text-primary">{targetCorrectCount}</span>
                <span className="text-lg text-muted-foreground ml-2">题</span>
              </div>
              <Slider
                value={[targetCorrectCount]}
                onValueChange={(value) => setTargetCorrectCount(value[0])}
                min={10}
                max={500}
                step={10}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10</span>
                <span>100</span>
                <span>200</span>
                <span>300</span>
                <span>500</span>
              </div>
            </div>

            {/* 答错扣减 */}
            <div className="space-y-2">
              <Label>每答错一题扣减</Label>
              <div className="text-center mb-2">
                <span className="text-3xl font-bold text-[#D32F2F]">{penaltyPerWrong}</span>
                <span className="text-lg text-muted-foreground ml-2">题</span>
              </div>
              <Slider
                value={[penaltyPerWrong]}
                onValueChange={(value) => setPenaltyPerWrong(value[0])}
                min={0}
                max={10}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0（不扣减）</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            {/* 提示信息 */}
            <div className="bg-[#F5F5F5] border border-blue-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-[#1976D2] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 space-y-1">
                <p>• 挑战开始后，题目数量将变为无限</p>
                <p>• 孩子可以多次间断进行，随时保存进度</p>
                <p>• 一次只能有一个进行中的挑战</p>
              </div>
            </div>

            <Button onClick={handleNext} className="w-full" size="lg">
              <Target className="w-5 h-5 mr-2" />
              下一步：验证家长密码
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">家长密码 *</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入您的登录密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSubmit();
                  }
                }}
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-700">
                为了确保挑战设置的严肃性，请输入您的账号密码进行验证。
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("setup")}
                className="flex-1"
                disabled={verifyPasswordMutation.isPending}
              >
                返回
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
                disabled={verifyPasswordMutation.isPending || !password}
              >
                {verifyPasswordMutation.isPending ? "验证中..." : "确认创建"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
