/**
 * FeedbackPage.tsx - 游客扫码提交意见页面（公开，无需登录）
 * 数据架构统一后：
 *   - 路由参数：/feedback/:ledgerId/:categoryId? （ledgerId=意见本ID，categoryId=分店ID，可选）
 *   - 提交到 ledger_records 表（通过 opinionBook.submitEntry 接口）
 *   - 公开信息从 opinionBook.getPublicInfo 接口获取
 */
import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Star, CheckCircle, MessageSquare, Store } from "lucide-react";
import { toast } from "sonner";

export default function FeedbackPage() {
  // 路由参数：ledgerId（意见本ID），categoryId（分店ID，可选）
  const params = useParams<{ ledgerId: string; categoryId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const categoryId = params.categoryId ? parseInt(params.categoryId) : undefined;

  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [guestName, setGuestName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // 获取意见本公开信息（门店名 + 分店名）
  const { data: info, isLoading, error } = trpc.opinionBook.getPublicInfo.useQuery(
    { ledgerId, categoryId },
    { enabled: ledgerId > 0 }
  );

  // 提交意见
  const submitMutation = trpc.opinionBook.submitEntry.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (e) => toast.error(e.message || "提交失败，请重试"),
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error("请填写您的意见");
      return;
    }
    submitMutation.mutate({
      ledgerId,
      categoryId,
      content: content.trim(),
      rating: rating || undefined,
      guestName: guestName.trim() || undefined,
    });
  };

  // 加载中
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  // 错误（无效二维码）
  if (error || !info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center text-gray-500">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">二维码已失效或不存在</p>
          <p className="text-sm mt-1 text-gray-400">请联系工作人员获取新的二维码</p>
        </div>
      </div>
    );
  }

  // 提交成功
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">感谢您的反馈！</h2>
          <p className="text-gray-500 text-sm">
            您的意见已收到，我们会认真改进，为您提供更好的服务。
          </p>
          <div className="mt-6 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400">{info.book.name}</p>
            {info.branch && (
              <p className="text-sm font-medium text-gray-600 mt-1">{info.branch.name}</p>
            )}
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => {
              setSubmitted(false);
              setContent("");
              setRating(0);
              setGuestName("");
            }}
          >
            再次提交
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white">
      {/* 顶部门店信息 */}
      <div className="bg-[#D32F2F] text-white px-6 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-1">
          <Store className="w-5 h-5 opacity-80" />
          <span className="text-sm opacity-90">{info.book.name}</span>
        </div>
        <h1 className="text-2xl font-bold">您好！</h1>
        {info.branch && (
          <p className="text-sm opacity-80 mt-1">
            <span className="font-semibold">{info.branch.name}</span>
          </p>
        )}
        <p className="text-xs opacity-70 mt-2">您的意见对我们非常重要，请留下您的宝贵建议</p>
      </div>

      {/* 表单区域 */}
      <div className="px-6 py-6 space-y-5 max-w-lg mx-auto">
        {/* 评分 */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            您的评分（可选）
          </Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(rating === s ? 0 : s)}
                className="transition-transform active:scale-90"
              >
                <Star
                  className={`w-9 h-9 transition-colors ${
                    s <= (hoverRating || rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-200 fill-gray-100'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {['', '很差', '较差', '一般', '满意', '非常满意'][rating]}
            </p>
          )}
        </div>

        {/* 意见内容 */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            您的意见 <span className="text-red-500">*</span>
          </Label>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="请分享您的体验、服务感受或改进建议..."
            className="min-h-[120px] text-sm resize-none"
            maxLength={500}
          />
          <p className="text-xs text-gray-400 text-right mt-1">{content.length}/500</p>
        </div>

        {/* 昵称（可选）*/}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            您的称呼（可选）
          </Label>
          <Input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="如：张先生、匿名顾客..."
            className="text-sm"
            maxLength={20}
          />
        </div>

        {/* 提交按钮 */}
        <Button
          className="w-full h-12 text-base bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl"
          disabled={submitMutation.isPending || !content.trim()}
          onClick={handleSubmit}
        >
          {submitMutation.isPending ? "提交中..." : "提交意见"}
        </Button>

        <p className="text-xs text-center text-gray-400">
          您的意见将匿名提交，感谢您的参与
        </p>
      </div>
    </div>
  );
}
