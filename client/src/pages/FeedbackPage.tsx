/**
 * FeedbackPage.tsx - 游客扫码提交意见页面（公开，无需登录）
 * 路由：/feedback/:ledgerId/:categoryId?
 * 动线：意见填写（上）→ 支付（下）
 */
import { useState, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle, MessageSquare, Camera, X, Star, ChevronDown, ChevronUp } from "lucide-react";
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

const RATING_LABELS = ["", "很差", "较差", "一般", "满意", "非常满意"];

export default function FeedbackPage() {
  const params = useParams<{ ledgerId: string; categoryId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const categoryId = params.categoryId ? parseInt(params.categoryId) : undefined;

  // 意见填写展开状态（默认展开）
  const [opinionOpen, setOpinionOpen] = useState(true);
  // 意见分类
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 评分
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  // 补充文字
  const [content, setContent] = useState("");
  // 图片（最多5张）
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 称谓 + 微信号
  const [guestName, setGuestName] = useState("");
  const [guestWechat, setGuestWechat] = useState("");
  // 提交状态
  const [submitted, setSubmitted] = useState(false);
  // 支付
  const [amount, setAmount] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  // 获取意见本公开信息
  const { data: info, isLoading, error } = trpc.opinionBook.getPublicInfo.useQuery(
    { ledgerId, categoryId },
    { enabled: ledgerId > 0 }
  );

  // 提交意见
  const submitMutation = trpc.opinionBook.submitEntry.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setOpinionOpen(false);
    },
    onError: (e) => toast.error(e.message || "提交失败，请重试"),
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 5) {
      toast.error("最多上传5张图片");
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

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!selectedCategory && selectedTags.length === 0 && !content.trim()) {
      toast.error("请至少选择一个意见类型或填写内容");
      return;
    }
    const parts: string[] = [];
    if (selectedCategory) {
      const cat = OPINION_CATEGORIES.find(c => c.id === selectedCategory);
      if (cat) parts.push(`【${cat.label}】`);
    }
    if (selectedTags.length > 0) parts.push(selectedTags.join("、"));
    if (content.trim()) parts.push(content.trim());
    const finalContent = parts.join(" ") || "（无文字内容）";
    submitMutation.mutate({
      ledgerId,
      categoryId,
      content: finalContent,
      rating: rating || undefined,
      guestName: guestName.trim() || undefined,
    });
  };

  // 95折计算
  const discountedAmount = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0
    ? (parseFloat(amount) * 0.95).toFixed(2)
    : null;

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
    } catch {
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

  // ===== 主页面 =====
  return (
    <div className="min-h-screen bg-[#F5F5F5]">

      {/* ── 顶部红色区（压缩版，含KFC Logo） ── */}
      <div className="bg-[#D32F2F] px-4 py-3 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-3 -left-3 w-14 h-14 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs mb-0.5 truncate">
              {info.book.name}{info.branch ? ` · ${info.branch.name}` : ""}
            </p>
            <h1 className="text-white text-lg font-bold leading-tight">欢迎提意见</h1>
            <p className="text-white/70 text-xs mt-0.5">提交后享 <span className="text-yellow-300 font-semibold">95折</span> 优惠</p>
          </div>
          <div className="ml-3 flex-shrink-0">
            <img src="/kfc-logo.png" alt="KFC" className="w-16 h-16 object-contain drop-shadow-lg" />
          </div>
        </div>
      </div>

      {/* ── 主内容区 ── */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-3">

        {/* ══════════════════════════════════════
            第一区：意见填写（动线上方）
        ══════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 折叠标题 */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
            onClick={() => setOpinionOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              {submitted ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <MessageSquare className="w-4 h-4 text-[#D32F2F]" />
              )}
              <span className="font-semibold text-sm text-gray-800">
                {submitted ? "意见已提交，感谢您！" : "填写意见（提交后享95折）"}
              </span>
            </div>
            {opinionOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {/* 意见填写内容 */}
          {opinionOpen && !submitted && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50">

              {/* Step 1: 意见类型 */}
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">意见类型</p>
                <div className="flex gap-2">
                  {OPINION_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(selectedCategory === cat.id ? null : cat.id);
                        setSelectedTags([]);
                      }}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                        selectedCategory === cat.id
                          ? "bg-[#D32F2F] text-white border-[#D32F2F]"
                          : "bg-gray-50 text-gray-600 border-gray-100 active:bg-gray-100"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: 具体标签 */}
              {selectedCategory && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">具体问题（可多选）</p>
                  <div className="flex flex-wrap gap-2">
                    {OPINION_CATEGORIES.find(c => c.id === selectedCategory)?.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                          selectedTags.includes(tag)
                            ? "bg-[#D32F2F] text-white border-[#D32F2F]"
                            : "bg-gray-50 text-gray-600 border-gray-200 active:bg-gray-100"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: 评分 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">整体评分（可选）</p>
                <div className="flex gap-2 justify-center">
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
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-200 fill-gray-100"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="text-xs text-center text-gray-500 mt-1">{RATING_LABELS[rating]}</p>
                )}
              </div>

              {/* Step 4: 拍照 + 补充说明 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  拍照（最多5张，可选）
                </p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-100">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5 text-gray-400 active:bg-gray-50"
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-xs">{images.length}/5</span>
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

                {/* 补充说明 */}
                <Textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="请给我更多宝贵建议，一经采纳，我们将为你免除本次的餐费。"
                  className="min-h-[80px] text-sm resize-none bg-gray-50 border-gray-100"
                  maxLength={500}
                />
                <p className="text-xs text-gray-300 text-right mt-0.5">{content.length}/500</p>
              </div>

              {/* 称谓 + 微信号（同行，用placeholder提示，无标题行） */}
              <div className="flex gap-2">
                <Input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="您的称谓（可选）"
                  className="flex-1 text-sm bg-gray-50 border-gray-100"
                  maxLength={20}
                />
                <Input
                  value={guestWechat}
                  onChange={e => setGuestWechat(e.target.value)}
                  placeholder="微信号（可选）"
                  className="flex-1 text-sm bg-gray-50 border-gray-100"
                  maxLength={30}
                />
              </div>

              {/* 提交按钮 */}
              <Button
                className="w-full h-12 text-base font-bold bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-100"
                disabled={submitMutation.isPending}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    提交中...
                  </span>
                ) : (
                  "提交意见，解锁 95 折优惠"
                )}
              </Button>
            </div>
          )}

          {/* 提交成功后的简洁提示 */}
          {submitted && (
            <div className="px-4 pb-4 border-t border-gray-50">
              <div className="pt-3 text-center">
                <p className="text-sm text-gray-500">您的意见已收到，老板会亲自查看</p>
                <button
                  className="mt-2 text-xs text-[#D32F2F] underline underline-offset-2"
                  onClick={() => {
                    setSubmitted(false);
                    setSelectedCategory(null);
                    setSelectedTags([]);
                    setContent("");
                    setRating(0);
                    setGuestName("");
                    setGuestWechat("");
                    setImages([]);
                    setImageFiles([]);
                    setOpinionOpen(true);
                  }}
                >
                  再次提交意见
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════
            第二区：支付（动线下方）
        ══════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 标题栏 */}
          <div className="bg-gradient-to-r from-[#D32F2F] to-rose-500 px-4 py-2.5 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">本次消费付款</span>
            {submitted ? (
              <span className="flex items-center gap-1 text-yellow-300 text-xs font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                意见已提交，享95折
              </span>
            ) : (
              <span className="text-white/70 text-xs">提交意见后享95折</span>
            )}
          </div>

          <div className="p-4">
            {/* 金额输入 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-400 text-2xl font-light">¥</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="输入消费金额"
                className="flex-1 text-3xl font-bold text-gray-800 bg-transparent border-0 border-b-2 border-gray-200 focus:border-[#D32F2F] outline-none pb-1 placeholder:text-gray-200 placeholder:text-2xl"
              />
            </div>

            {/* 折扣展示 */}
            {discountedAmount ? (
              <div className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-2.5 mb-3">
                <div>
                  <p className="text-xs text-gray-400">95折优惠后实付</p>
                  <p className="text-2xl font-bold text-[#D32F2F]">¥{discountedAmount}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">节省</p>
                  <p className="text-base font-semibold text-orange-500">
                    ¥{(parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-4 py-2.5 mb-3 text-center">
                <p className="text-xs text-gray-400">输入金额后自动计算95折优惠</p>
              </div>
            )}

            {/* 支付按钮 */}
            <button
              onClick={handleAlipayPay}
              disabled={!discountedAmount || payLoading || !submitted}
              className={`w-full py-3.5 rounded-xl font-bold text-base transition-all ${
                discountedAmount && !payLoading && submitted
                  ? "bg-[#1677FF] text-white shadow-md active:bg-blue-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {payLoading
                ? "订单创建中..."
                : !submitted
                  ? "请先提交意见解锁优惠"
                  : discountedAmount
                    ? `支付宝付款  ¥${discountedAmount}`
                    : "输入金额后付款"}
            </button>

            {!submitted && (
              <p className="text-xs text-center text-gray-400 mt-2">
                提交意见后，支付按钮自动解锁
              </p>
            )}
            {submitted && (
              <p className="text-xs text-center text-gray-400 mt-2">
                点击后跳转支付宝完成付款
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 pb-2">
          您的意见将匿名提交，感谢您的参与
        </p>
      </div>
    </div>
  );
}
