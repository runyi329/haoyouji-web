import { useState, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Star, Camera, X, ChevronLeft, CheckCircle2 } from "lucide-react";
import { autoCompressImage } from "@/utils/imageUtils";

// ─── 星级选择组件 ─────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ["", "很差", "较差", "一般", "满意", "非常满意"];
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
            className="transition-transform active:scale-90"
          >
            <Star
              className="w-10 h-10 transition-colors"
              fill={(hover || value) >= star ? "#FF6900" : "none"}
              stroke={(hover || value) >= star ? "#FF6900" : "#d1d5db"}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      {(hover || value) > 0 && (
        <span className="text-[13px] font-semibold" style={{ color: "#FF6900" }}>
          {labels[hover || value]}
        </span>
      )}
    </div>
  );
}

// ─── 评价提交页 ───────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const params = new URLSearchParams(search);
  const orderIdStr = params.get("orderId");
  const orderId = orderIdStr ? parseInt(orderIdStr) : null;

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]); // base64
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingReview } = mtrpc.review.myReview.useQuery(
    { orderId: orderId! },
    { enabled: !!orderId && isAuthenticated }
  );

  const submitMutation = mtrpc.review.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("评价提交成功，感谢您的反馈！");
    },
    onError: (e: any) => toast.error(e.message ?? "提交失败，请重试"),
  });

  const handleImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (images.length + files.length > 6) {
      toast.error("最多上传6张图片");
      return;
    }
    for (const file of files) {
      try {
        const compressed = await autoCompressImage(file, "normal");
        setImages(prev => [...prev, compressed]);
      } catch {
        toast.error("图片处理失败");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!orderId) { toast.error("订单信息缺失"); return; }
    if (rating < 1) { toast.error("请选择星级"); return; }
    submitMutation.mutate({ orderId, rating, content: content.trim() || undefined, images, isAnonymous });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
        <p className="text-[14px] text-gray-500">请先登录后再评价</p>
      </div>
    );
  }

  if (!orderId) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
        <p className="text-[14px] text-gray-500">订单信息缺失</p>
        <button onClick={() => navigate("/p/proj_hzxm2t/my-orders")} className="mt-4 text-[13px] text-orange-500">返回我的订单</button>
      </div>
    );
  }

  // 已评价
  if (existingReview || submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 gap-4">
        <CheckCircle2 className="w-16 h-16 text-green-400" />
        <p className="text-[16px] font-bold text-gray-800">评价已提交</p>
        <p className="text-[13px] text-gray-400">感谢您的宝贵反馈！</p>
        <button
          onClick={() => navigate("/p/proj_hzxm2t/my-orders")}
          className="mt-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "#FF6900" }}
        >
          返回我的订单
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center px-4 py-3">
        <button onClick={() => navigate("/p/proj_hzxm2t/my-orders")} className="p-1 -ml-1 mr-2">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-[16px] font-bold text-gray-900 flex-1">评价订单</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 商品信息 */}
        <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
          <img src="/pear-img-hero.jpg" alt="天桂梨" className="w-14 h-14 rounded-xl object-cover" />
          <div>
            <p className="text-[14px] font-bold text-gray-900">天桂梨</p>
            <p className="text-[12px] text-gray-400 mt-0.5">订单 #{orderId}</p>
          </div>
        </div>

        {/* 星级评分 */}
        <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
          <p className="text-[14px] font-semibold text-gray-700">您对本次购物满意吗？</p>
          <StarRating value={rating} onChange={setRating} />
        </div>

        {/* 文字评价 */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[13px] font-semibold text-gray-600 mb-2">评价内容（选填）</p>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="分享您的使用感受，帮助更多买家做出选择..."
            className="w-full text-[14px] text-gray-800 placeholder-gray-300 border border-gray-100 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-200 bg-gray-50"
          />
          <p className="text-[11px] text-gray-300 text-right mt-1">{content.length}/500</p>
        </div>

        {/* 图片上传 */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[13px] font-semibold text-gray-600 mb-3">上传图片（选填，最多6张）</p>
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {images.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <Camera className="w-5 h-5 text-gray-300" />
                <span className="text-[10px] text-gray-300">添加图片</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageAdd}
          />
        </div>

        {/* 匿名选项 */}
        <div className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between">
          <span className="text-[13px] text-gray-600">匿名评价</span>
          <button
            onClick={() => setIsAnonymous(!isAnonymous)}
            className={`w-11 h-6 rounded-full transition-colors relative ${isAnonymous ? "bg-orange-400" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAnonymous ? "translate-x-5.5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || rating < 1}
          className="w-full py-4 rounded-2xl text-[15px] font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: "#FF6900" }}
        >
          {submitMutation.isPending ? "提交中..." : "提交评价"}
        </button>
      </div>
    </div>
  );
}
