/**
 * FeedbackPage.tsx - 游客扫码提交意见页面（公开，无需登录）
 * 路由：/feedback/:ledgerId/:categoryId?
 * 特性：
 *   - 按钮式意见分类选择（菜品/服务/环境）
 *   - 二级标签选择（太咸/太淡/太油/料太少 等）
 *   - 拍照/上传图片
 *   - 文字补充（可选）
 *   - 提交后不跳转，显示成功提示
 *   - 底部95折支付入口（支付宝模拟）
 */
import { useState, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle, MessageSquare, Store, Camera, X, Star, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

// ===== 意见分类数据 =====
const OPINION_CATEGORIES = [
  {
    id: "food",
    label: "菜品",
    tags: ["太咸", "太淡", "太油腻", "料太少", "份量不足", "不新鲜", "口味一般", "温度不对"],
  },
  {
    id: "service",
    label: "服务",
    tags: ["上菜太慢", "服务态度差", "点单出错", "服务不周到", "等待时间长", "结账麻烦"],
  },
  {
    id: "environment",
    label: "环境",
    tags: ["卫生较差", "噪音太大", "座位不舒适", "停车不便", "装修一般", "空调太冷/热"],
  },
];

// ===== 评分标签 =====
const RATING_LABELS = ["", "很差", "较差", "一般", "满意", "非常满意"];

export default function FeedbackPage() {
  const params = useParams<{ ledgerId: string; categoryId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const categoryId = params.categoryId ? parseInt(params.categoryId) : undefined;

  // 意见分类
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 评分
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  // 补充文字
  const [content, setContent] = useState("");
  // 图片
  const [images, setImages] = useState<string[]>([]); // base64 预览
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 昵称
  const [guestName, setGuestName] = useState("");
  // 提交状态
  const [submitted, setSubmitted] = useState(false);
  // 支付区域
  const [showPayment, setShowPayment] = useState(false);
  const [amount, setAmount] = useState("");

  // 获取意见本公开信息
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

  // 切换标签
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // 选择图片
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) {
      toast.error("最多上传3张图片");
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages(prev => [...prev, ev.target?.result as string]);
        setImageFiles(prev => [...prev, file]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // 删除图片
  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 提交
  const handleSubmit = () => {
    if (!selectedCategory && selectedTags.length === 0 && !content.trim()) {
      toast.error("请至少选择一个意见类型或填写内容");
      return;
    }
    // 组合内容
    const parts: string[] = [];
    if (selectedCategory) {
      const cat = OPINION_CATEGORIES.find(c => c.id === selectedCategory);
      if (cat) parts.push(`【${cat.label.replace(/^./, '')}】`);
    }
    if (selectedTags.length > 0) {
      parts.push(selectedTags.join("、"));
    }
    if (content.trim()) {
      parts.push(content.trim());
    }
    const finalContent = parts.join(" ") || "（无文字内容）";

    submitMutation.mutate({
      ledgerId,
      categoryId,
      content: finalContent,
      rating: rating || undefined,
      guestName: guestName.trim() || undefined,
    });
  };

  // 计算95折金额
  const discountedAmount = amount && !isNaN(parseFloat(amount))
    ? (parseFloat(amount) * 0.95).toFixed(2)
    : null;

  // 支付状态
  const [payLoading, setPayLoading] = useState(false);

  // 创建支付宝订单并跳转
  const handleAlipayPay = async () => {
    if (!discountedAmount) {
      toast.error("请先输入消费金额");
      return;
    }
    setPayLoading(true);
    try {
      const res = await fetch("/api/alipay/feedback-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(discountedAmount),
          ledgerId,
          subject: `${info?.ledgerName || "好友记"}-意见反馈95折优惠`,
        }),
      });
      const data = await res.json();
      if (data.success && data.payUrl) {
        window.location.href = data.payUrl;
      } else {
        toast.error(data.error || "创建支付订单失败");
      }
    } catch (e) {
      toast.error("网络错误，请重试");
    } finally {
      setPayLoading(false);
    }
  };

  // ===== 加载中 =====
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

  // ===== 错误 =====
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

  // ===== 提交成功 =====
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col items-center justify-start pt-16 p-6">
        <div className="text-center max-w-xs w-full">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">感谢您的反馈！</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            您的意见已收到，老板会亲自查看。<br />
            我们会认真改进，为您提供更好的服务。
          </p>

          {/* 专属优惠 */}
          <div className="mt-6 bg-gradient-to-r from-red-500 to-rose-500 rounded-2xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-80 mb-1">感谢您的宝贵意见</p>
            <p className="text-2xl font-bold">专属 95 折优惠</p>
            <p className="text-xs opacity-80 mt-1">本次消费享受折扣，请在下方输入金额付款</p>
          </div>

          {/* 支付区域 */}
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 w-full">
            <p className="text-sm font-medium text-gray-700 mb-3">本次消费金额</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-500 text-lg">¥</span>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="请输入消费金额"
                className="text-xl font-bold text-center border-0 border-b-2 border-gray-200 rounded-none focus-visible:ring-0 focus-visible:border-red-400"
              />
            </div>
            {discountedAmount && (
              <div className="bg-red-50 rounded-xl p-3 mb-3">
                <p className="text-xs text-gray-500">95折后实付</p>
                <p className="text-3xl font-bold text-red-600">¥{discountedAmount}</p>
                <p className="text-xs text-gray-400 mt-1">优惠了 ¥{(parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)}</p>
              </div>
            )}
            <button
              onClick={handleAlipayPay}
              disabled={!discountedAmount || payLoading}
              className={`block w-full py-3 rounded-xl text-center font-bold text-white text-base transition-all ${
                discountedAmount && !payLoading
                  ? "bg-[#1677FF] active:bg-blue-700 shadow-md"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {payLoading ? "订单创建中...请稍候" : `支付宝付款${discountedAmount ? ` ¥${discountedAmount}` : ""}`}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">点击后将跳转至支付宝完成付款</p>
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => {
              setSubmitted(false);
              setSelectedCategory(null);
              setSelectedTags([]);
              setContent("");
              setRating(0);
              setGuestName("");
              setImages([]);
              setImageFiles([]);
              setAmount("");
            }}
          >
            再次提交意见
          </Button>
        </div>
      </div>
    );
  }

  // ===== 主页面 =====
  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      {/* 顶部欢迎区 */}
      <div className="bg-[#D32F2F] text-white px-5 pt-10 pb-8 relative overflow-hidden">
        {/* 装饰圆 */}
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white/10 rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-2 opacity-80">
            <Store className="w-4 h-4" />
            <span className="text-xs">{info.book.name}</span>
            {info.branch && (
              <>
                <span className="text-xs opacity-60">·</span>
                <span className="text-xs">{info.branch.name}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-tight">欢迎提意见</h1>
          <p className="text-sm opacity-80 mt-1.5 leading-relaxed">
            您的意见，老板会亲自看到<br />
            <span className="text-xs opacity-70">提交后享受 95 折优惠</span>
          </p>
        </div>
      </div>

      {/* 表单区域 */}
      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto pb-10">

        {/* Step 1: 意见类型 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            <span className="inline-block w-5 h-5 bg-[#D32F2F] text-white text-xs rounded-full text-center leading-5 mr-1.5">1</span>
            您的意见是关于哪方面？
          </p>
          <div className="flex gap-2">
            {OPINION_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(selectedCategory === cat.id ? null : cat.id);
                  setSelectedTags([]);
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border-2 ${
                  selectedCategory === cat.id
                    ? "bg-[#D32F2F] text-white border-[#D32F2F] shadow-md scale-[1.02]"
                    : "bg-gray-50 text-gray-600 border-gray-100 active:bg-gray-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: 具体标签（展开） */}
        {selectedCategory && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              <span className="inline-block w-5 h-5 bg-[#D32F2F] text-white text-xs rounded-full text-center leading-5 mr-1.5">2</span>
              具体是哪些问题？（可多选）
            </p>
            <div className="flex flex-wrap gap-2">
              {OPINION_CATEGORIES.find(c => c.id === selectedCategory)?.tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                    selectedTags.includes(tag)
                      ? "bg-[#D32F2F] text-white border-[#D32F2F]"
                      : "bg-gray-50 text-gray-600 border-gray-200 active:bg-gray-100"
                  }`}
                >
                  {selectedTags.includes(tag) ? "✓ " : ""}{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: 评分 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            <span className="inline-block w-5 h-5 bg-[#D32F2F] text-white text-xs rounded-full text-center leading-5 mr-1.5">{selectedCategory ? "3" : "2"}</span>
            整体评分（可选）
          </p>
          <div className="flex gap-3 justify-center">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(rating === s ? 0 : s)}
                className="transition-transform active:scale-90"
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    s <= (hoverRating || rating)
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-200 fill-gray-100"
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-sm text-center text-gray-500 mt-2 font-medium">{RATING_LABELS[rating]}</p>
          )}
        </div>

        {/* Step 4: 图片 + 文字补充 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            <span className="inline-block w-5 h-5 bg-[#D32F2F] text-white text-xs rounded-full text-center leading-5 mr-1.5">{selectedCategory ? "4" : "3"}</span>
            拍照 / 补充说明（可选）
          </p>

          {/* 图片上传 */}
          <div className="flex gap-2 flex-wrap mb-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 active:bg-gray-50"
              >
                <Camera className="w-6 h-6" />
                <span className="text-xs">拍照</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          {/* 文字补充 */}
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="还有什么想说的？（可不填）"
            className="min-h-[80px] text-sm resize-none bg-gray-50 border-gray-100"
            maxLength={500}
          />
          <p className="text-xs text-gray-300 text-right mt-1">{content.length}/500</p>
        </div>

        {/* 昵称 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            您的称呼（可选）
          </p>
          <Input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="如：张先生、匿名顾客..."
            className="text-sm bg-gray-50 border-gray-100"
            maxLength={20}
          />
        </div>

        {/* 提交按钮 */}
        <Button
          className="w-full h-14 text-base font-bold bg-[#D32F2F] hover:bg-red-700 text-white rounded-2xl shadow-lg shadow-red-200"
          disabled={submitMutation.isPending}
          onClick={handleSubmit}
        >
          {submitMutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              提交中...
            </span>
          ) : (
            "提交意见，领取 95 折优惠"
          )}
        </Button>

        <p className="text-xs text-center text-gray-400 pb-4">
          您的意见将匿名提交，感谢您的参与
        </p>
      </div>
    </div>
  );
}
