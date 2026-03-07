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
import { CheckCircle, MessageSquare, Camera, X, Star, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// ===== 6大维度 + 子维度数据 =====
const OPINION_DIMENSIONS = [
  {
    id: "food",
    label: "菜品质量",
    emoji: "🍽️",
    desc: "口味、食材、分量",
    subItems: [
      { id: "food_salty", label: "太咸" },
      { id: "food_bland", label: "太淡" },
      { id: "food_oily", label: "太油腻" },
      { id: "food_sweet", label: "太甜" },
      { id: "food_fresh", label: "食材不新鲜" },
      { id: "food_smell", label: "有异味" },
      { id: "food_temp", label: "温度不对" },
      { id: "food_portion", label: "分量不足" },
      { id: "food_ratio", label: "配菜多于主料" },
      { id: "food_price", label: "性价比低" },
      { id: "food_look", label: "卖相不佳" },
      { id: "food_cook", label: "火候不对" },
    ],
  },
  {
    id: "service",
    label: "服务表现",
    emoji: "👨‍💼",
    desc: "态度、响应、专业度",
    subItems: [
      { id: "svc_slow", label: "响应太慢" },
      { id: "svc_attitude", label: "态度不好" },
      { id: "svc_knowledge", label: "不了解菜品" },
      { id: "svc_proactive", label: "不够主动" },
      { id: "svc_order", label: "点单出错" },
      { id: "svc_bill", label: "结账不顺畅" },
      { id: "svc_seat", label: "领位不及时" },
      { id: "svc_water", label: "未主动加水" },
      { id: "svc_plate", label: "未及时撤空盘" },
      { id: "svc_mechanical", label: "服务过于机械" },
    ],
  },
  {
    id: "env",
    label: "环境氛围",
    emoji: "🏠",
    desc: "装修、舒适度、噪音",
    subItems: [
      { id: "env_noise", label: "噪音太大" },
      { id: "env_light", label: "灯光刺眼" },
      { id: "env_ac", label: "空调不适" },
      { id: "env_seat", label: "座椅不舒适" },
      { id: "env_smell", label: "有油烟/异味" },
      { id: "env_music", label: "音乐音量不合适" },
      { id: "env_style", label: "装修不符定位" },
      { id: "env_private", label: "私密性不够" },
    ],
  },
  {
    id: "hygiene",
    label: "卫生安全",
    emoji: "🧼",
    desc: "餐具、桌面、洗手间",
    subItems: [
      { id: "hyg_utensil", label: "餐具不干净" },
      { id: "hyg_table", label: "桌面不干净" },
      { id: "hyg_toilet", label: "洗手间脏乱" },
      { id: "hyg_staff", label: "员工仪容不整" },
      { id: "hyg_residue", label: "桌缝有残渣" },
      { id: "hyg_water", label: "餐具有水渍" },
    ],
  },
  {
    id: "efficiency",
    label: "运营效率",
    emoji: "⏱️",
    desc: "上菜速度、预约流程",
    subItems: [
      { id: "eff_dish", label: "上菜太慢" },
      { id: "eff_miss", label: "漏单" },
      { id: "eff_wait", label: "等位时间长" },
      { id: "eff_book", label: "预约流程繁琐" },
      { id: "eff_queue", label: "排队不公平" },
    ],
  },
  {
    id: "value",
    label: "价值感",
    emoji: "💰",
    desc: "性价比、定价合理性",
    subItems: [
      { id: "val_price", label: "整体偏贵" },
      { id: "val_drink", label: "酒水定价过高" },
      { id: "val_hidden", label: "有隐性消费" },
      { id: "val_worth", label: "不值这个价" },
      { id: "val_good", label: "性价比很高" },
    ],
  },
];

const RATING_LABELS = ["", "很差", "较差", "一般", "满意", "非常满意"];

export default function FeedbackPage() {
  const params = useParams<{ ledgerId: string; categoryId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const categoryId = params.categoryId ? parseInt(params.categoryId) : undefined;

  const urlSearch = new URLSearchParams(window.location.search);
  const urlBranch = urlSearch.get("branch") || "";
  const urlTable = urlSearch.get("table") || "";

  // 意见填写展开状态
  const [opinionOpen, setOpinionOpen] = useState(true);
  // 选中的主维度（可多选）
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  // 展开的维度（用于显示子维度）
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  // 选中的子维度
  const [selectedSubItems, setSelectedSubItems] = useState<string[]>([]);
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
  const [scanTime] = useState(() => new Date());

  const { data: info, isLoading, error } = trpc.opinionBook.getPublicInfo.useQuery(
    { ledgerId, categoryId },
    { enabled: ledgerId > 0 }
  );

  const submitMutation = trpc.opinionBook.submitEntry.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setOpinionOpen(false);
    },
    onError: (e) => toast.error(e.message || "提交失败，请重试"),
  });

  // 切换主维度选中
  const toggleDimension = (id: string) => {
    setSelectedDimensions(prev => {
      if (prev.includes(id)) {
        // 取消选中时，同时清除该维度的子维度
        const dim = OPINION_DIMENSIONS.find(d => d.id === id);
        if (dim) {
          const subIds = dim.subItems.map(s => s.id);
          setSelectedSubItems(prev2 => prev2.filter(s => !subIds.includes(s)));
        }
        if (expandedDimension === id) setExpandedDimension(null);
        return prev.filter(d => d !== id);
      } else {
        setExpandedDimension(id);
        return [...prev, id];
      }
    });
  };

  // 切换子维度
  const toggleSubItem = (id: string) => {
    setSelectedSubItems(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
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
    if (selectedDimensions.length === 0 && selectedSubItems.length === 0 && !content.trim()) {
      toast.error("请至少选择一个维度或填写内容");
      return;
    }

    // 组装内容：维度标签 + 子维度 + 自由文字
    const parts: string[] = [];

    // 按维度分组输出
    selectedDimensions.forEach(dimId => {
      const dim = OPINION_DIMENSIONS.find(d => d.id === dimId);
      if (!dim) return;
      const selectedSubs = dim.subItems
        .filter(s => selectedSubItems.includes(s.id))
        .map(s => s.label);
      if (selectedSubs.length > 0) {
        parts.push(`【${dim.label}】${selectedSubs.join("、")}`);
      } else {
        parts.push(`【${dim.label}】`);
      }
    });

    if (content.trim()) parts.push(content.trim());
    const finalContent = parts.join(" ") || "（无文字内容）";

    submitMutation.mutate({
      ledgerId,
      categoryId,
      content: finalContent,
      rating: rating || undefined,
      guestName: guestName.trim() || undefined,
      guestWechat: guestWechat.trim() || undefined,
    });
  };

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

  return (
    <div className="min-h-screen bg-[#F5F5F5]">

      {/* ── 顶部红色区 ── */}
      <div className="bg-[#D32F2F] px-4 py-3 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-3 -left-3 w-14 h-14 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs mb-0.5 truncate">
              {info.book.name}
              {info.branch ? ` · ${info.branch.name}` : ""}
              {(info as any).tableName ? ` · ${(info as any).tableName}` : ""}
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
            意见填写区
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

          {opinionOpen && !submitted && (
            <div className="px-4 pb-4 space-y-5 border-t border-gray-50">

              {/* ── Step 1: 选择维度（6选多） ── */}
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2.5 uppercase tracking-wide">
                  这次体验，哪方面需要改进？（可多选）
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {OPINION_DIMENSIONS.map(dim => {
                    const isSelected = selectedDimensions.includes(dim.id);
                    const isExpanded = expandedDimension === dim.id;
                    return (
                      <button
                        key={dim.id}
                        onClick={() => toggleDimension(dim.id)}
                        className={`relative flex flex-col items-center justify-center py-3 px-1 rounded-xl text-center transition-all border-2 ${
                          isSelected
                            ? "bg-[#FFF5F5] border-[#D32F2F]"
                            : "bg-gray-50 border-gray-100 active:bg-gray-100"
                        }`}
                      >
                        <span className="text-xl mb-0.5">{dim.emoji}</span>
                        <span className={`text-xs font-semibold leading-tight ${isSelected ? "text-[#D32F2F]" : "text-gray-700"}`}>
                          {dim.label}
                        </span>
                        <span className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate w-full text-center px-1">
                          {dim.desc}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1 right-1 w-4 h-4 bg-[#D32F2F] rounded-full flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">✓</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Step 2: 子维度（按选中的维度展开） ── */}
              {selectedDimensions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    具体问题（可多选）
                  </p>
                  {selectedDimensions.map(dimId => {
                    const dim = OPINION_DIMENSIONS.find(d => d.id === dimId);
                    if (!dim) return null;
                    const isExpanded = expandedDimension === dimId;
                    const selectedCount = dim.subItems.filter(s => selectedSubItems.includes(s.id)).length;
                    return (
                      <div key={dimId} className="rounded-xl overflow-hidden border border-gray-100">
                        {/* 维度标题行（可折叠） */}
                        <button
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 active:bg-gray-100"
                          onClick={() => setExpandedDimension(isExpanded ? null : dimId)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{dim.emoji}</span>
                            <span className="text-sm font-semibold text-gray-700">{dim.label}</span>
                            {selectedCount > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>
                                已选 {selectedCount}
                              </span>
                            )}
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {/* 子维度标签 */}
                        {isExpanded && (
                          <div className="px-3 py-3 flex flex-wrap gap-2">
                            {dim.subItems.map(sub => {
                              const isSubSelected = selectedSubItems.includes(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => toggleSubItem(sub.id)}
                                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                                    isSubSelected
                                      ? "bg-[#D32F2F] text-white border-[#D32F2F]"
                                      : "bg-white text-gray-600 border-gray-200 active:bg-gray-50"
                                  }`}
                                >
                                  {sub.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Step 3: 整体评分 ── */}
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

              {/* ── Step 4: 拍照 + 补充说明 ── */}
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

                {/* 补充说明 —— 提示词改为新文案 */}
                <Textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="如果今天只能改进一点，你希望是什么？"
                  className="min-h-[80px] text-sm resize-none bg-gray-50 border-gray-100"
                  maxLength={500}
                />
                <p className="text-xs text-gray-300 text-right mt-0.5">{content.length}/500</p>
              </div>

              {/* ── Step 5: 称谓 + 微信号 ── */}
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

          {/* 提交成功后的提示 */}
          {submitted && (
            <div className="px-5 py-4 border-t border-gray-50">
              <p className="text-[15px] font-medium text-gray-700 leading-snug">
                感谢您的反馈，您的意见已收到，老板会亲自查看。
              </p>
              <button
                className="mt-3 text-xs text-gray-400"
                onClick={() => {
                  setSubmitted(false);
                  setSelectedDimensions([]);
                  setSelectedSubItems([]);
                  setExpandedDimension(null);
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
          )}
        </div>

        {/* ══════════════════════════════════════
            支付区
        ══════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <p className="text-xs text-gray-400 mb-1">
              {submitted ? "已享95折优惠" : "提交意见后享95折优惠"}
            </p>
            <p className="text-[13px] font-semibold text-gray-700">本次消费金额</p>
          </div>

          <div className="px-5 pb-5">
            <div className="mb-4 bg-gray-50 rounded-xl px-4 py-3 space-y-2">
              {(urlBranch || info?.branch) && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">分店</span>
                  <span className="text-gray-700 font-medium">{urlBranch || info?.branch?.name || info?.book?.name}</span>
                </div>
              )}
              {(urlTable || categoryId) && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">桌号</span>
                  <span className="text-gray-700 font-medium">{urlTable || `#${categoryId}`}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">扫码时间</span>
                <span className="text-gray-700">
                  {scanTime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <div className="flex items-end gap-1 mb-4 border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-xl mb-0.5">¥</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 text-[40px] font-light text-gray-900 bg-transparent border-0 outline-none leading-none placeholder:text-gray-200"
              />
            </div>

            {discountedAmount ? (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">原价</span>
                  <span className="text-gray-700">¥{parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">95折优惠</span>
                  <span className="text-[#1677FF]">-¥{(parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="text-sm font-semibold text-gray-800">实付金额</span>
                  <span className="text-xl font-bold text-gray-900">¥{discountedAmount}</span>
                </div>
              </div>
            ) : (
              <div className="mb-4 text-center py-2">
                <p className="text-sm text-gray-400">输入金额后自动计算95折优惠</p>
              </div>
            )}

            <button
              onClick={handleAlipayPay}
              disabled={!discountedAmount || payLoading || !submitted}
              className={`w-full py-3.5 rounded-full font-semibold text-[15px] transition-all ${
                discountedAmount && !payLoading && submitted
                  ? "bg-[#1677FF] text-white active:opacity-80"
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
