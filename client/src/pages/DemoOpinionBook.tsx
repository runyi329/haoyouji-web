/**
 * DemoOpinionBook.tsx - AB型意见簿演示页面（无需登录）
 * 路由：/demo/opinion/:bookId
 * 功能：顾客 / 店长 / 老板 三角色切换，复用真实数据和组件逻辑
 * 特点：无需登录，角色切换仅改变视角，不影响真实权限
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Search, Star, ChevronDown, MessageSquare, RefreshCw,
  CheckCircle, Camera, X, ChevronUp, ChevronRight, Share2, Eye, EyeOff,
  User, Briefcase, Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─── 六大维度（全3字标签，按高频/重要度排序，左右各10个，覆盖90%+客人感知）────────────
const OPINION_DIMENSIONS = [
  {
    id: "food", label: "菜品质量", desc: "口味、食材、分量",
    negItems: [
      { id: "food_bland", label: "味道淡" }, { id: "food_salty", label: "味道咸" },
      { id: "food_oily", label: "油太多" }, { id: "food_portion", label: "分量少" },
      { id: "food_fresh", label: "不新鲜" }, { id: "food_temp", label: "温度差" },
      { id: "food_tough", label: "口感老" }, { id: "food_look", label: "卖相差" },
      { id: "food_smell", label: "有异味" }, { id: "food_sweet", label: "甜度高" },
    ],
    posItems: [
      { id: "food_p_taste", label: "味正宗" }, { id: "food_p_fresh", label: "食材鲜" },
      { id: "food_p_portion", label: "分量足" }, { id: "food_p_temp", label: "温度好" },
      { id: "food_p_tender", label: "口感嫩" }, { id: "food_p_look", label: "摆盘美" },
      { id: "food_p_variety", label: "菜品多" }, { id: "food_p_special", label: "有特色" },
      { id: "food_p_healthy", label: "少油腻" }, { id: "food_p_sauce", label: "酱料棒" },
    ],
  },
  {
    id: "service", label: "服务表现", desc: "态度、响应、专业度",
    negItems: [
      { id: "svc_attitude", label: "态度差" }, { id: "svc_slow", label: "响应慢" },
      { id: "svc_proactive", label: "主动差" }, { id: "svc_order", label: "点单错" },
      { id: "svc_knowledge", label: "不懂菜" }, { id: "svc_bill", label: "结账慢" },
      { id: "svc_urge", label: "催单烦" }, { id: "svc_miss", label: "上菜漏" },
      { id: "svc_dish", label: "换盘慢" }, { id: "svc_seat", label: "领位乱" },
    ],
    posItems: [
      { id: "svc_p_smile", label: "态度好" }, { id: "svc_p_fast", label: "响应快" },
      { id: "svc_p_init", label: "很主动" }, { id: "svc_p_pro", label: "懂菜品" },
      { id: "svc_p_memory", label: "记偏好" }, { id: "svc_p_clean", label: "勤撤盘" },
      { id: "svc_p_water", label: "主加水" }, { id: "svc_p_guide", label: "推荐好" },
      { id: "svc_p_bill", label: "结账快" }, { id: "svc_p_care", label: "必应到" },
    ],
  },
  {
    id: "env", label: "环境氛围", desc: "噪音、温度、装修",
    negItems: [
      { id: "env_noise", label: "噪音大" }, { id: "env_crowd", label: "桌距密" },
      { id: "env_cold", label: "空调冷" }, { id: "env_hot", label: "空调热" },
      { id: "env_light", label: "灯光刺" }, { id: "env_smoke", label: "油烟味" },
      { id: "env_old", label: "装修旧" }, { id: "env_park", label: "停车难" },
      { id: "env_music", label: "音乐吵" }, { id: "env_toilet", label: "厕所难" },
    ],
    posItems: [
      { id: "env_p_cozy", label: "氛围好" }, { id: "env_p_quiet", label: "很安静" },
      { id: "env_p_design", label: "装修好" }, { id: "env_p_light", label: "灯光柔" },
      { id: "env_p_seat", label: "座位宽" }, { id: "env_p_photo", label: "拍照好" },
      { id: "env_p_park", label: "停车便" }, { id: "env_p_air", label: "空气好" },
      { id: "env_p_music", label: "音乐好" }, { id: "env_p_gather", label: "聚餐好" },
    ],
  },
  {
    id: "hygiene", label: "卫生安全", desc: "清洁、异物、过期",
    negItems: [
      { id: "hyg_utensil", label: "餐具脏" }, { id: "hyg_table", label: "桌面脏" },
      { id: "hyg_floor", label: "地面滑" }, { id: "hyg_toilet", label: "厕所脏" },
      { id: "hyg_foreign", label: "有异物" }, { id: "hyg_expired", label: "食材旧" },
      { id: "hyg_staff", label: "员工脏" }, { id: "hyg_pest", label: "有虫鼠" },
      { id: "hyg_smoke", label: "油烟重" }, { id: "hyg_air", label: "空气差" },
    ],
    posItems: [
      { id: "hyg_p_utensil", label: "餐具净" }, { id: "hyg_p_table", label: "桌面洁" },
      { id: "hyg_p_floor", label: "地面净" }, { id: "hyg_p_toilet", label: "厕所洁" },
      { id: "hyg_p_staff", label: "员工洁" }, { id: "hyg_p_food", label: "食材安" },
      { id: "hyg_p_air", label: "空气鲜" }, { id: "hyg_p_disinfect", label: "消毒好" },
      { id: "hyg_p_smell", label: "无异味" }, { id: "hyg_p_safe", label: "很安全" },
    ],
  },
  {
    id: "efficiency", label: "运营效率", desc: "等待、出餐、结账",
    negItems: [
      { id: "eff_wait", label: "等位久" }, { id: "eff_food", label: "出餐慢" },
      { id: "eff_pay", label: "结账慢" }, { id: "eff_order", label: "点单烦" },
      { id: "eff_queue", label: "叫号乱" }, { id: "eff_miss", label: "漏单错" },
      { id: "eff_urge", label: "催菜难" }, { id: "eff_book", label: "预约难" },
      { id: "eff_qr", label: "扫码卡" }, { id: "eff_peak", label: "高峰乱" },
    ],
    posItems: [
      { id: "eff_p_fast", label: "上菜快" }, { id: "eff_p_bill", label: "结账快" },
      { id: "eff_p_book", label: "预约便" }, { id: "eff_p_queue", label: "排队顺" },
      { id: "eff_p_wait", label: "等位短" }, { id: "eff_p_order", label: "点单快" },
      { id: "eff_p_call", label: "叫号准" }, { id: "eff_p_nowait", label: "无需等" },
      { id: "eff_p_qr", label: "系统顺" }, { id: "eff_p_peak", label: "高峰稳" },
    ],
  },
  {
    id: "value", label: "价值体验", desc: "性价比、优惠、体验",
    negItems: [
      { id: "val_price", label: "价格高" }, { id: "val_portion", label: "分量少" },
      { id: "val_promo", label: "优惠假" }, { id: "val_hidden", label: "有隐费" },
      { id: "val_worth", label: "不值价" }, { id: "val_trap", label: "套餐坑" },
      { id: "val_member", label: "会员差" }, { id: "val_rise", label: "涨价快" },
      { id: "val_gift", label: "赠品差" }, { id: "val_trick", label: "活动套" },
    ],
    posItems: [
      { id: "val_p_ratio", label: "性价高" }, { id: "val_p_worth", label: "超所值" },
      { id: "val_p_promo", label: "优惠好" }, { id: "val_p_portion", label: "分量足" },
      { id: "val_p_member", label: "会员好" }, { id: "val_p_activity", label: "活动真" },
      { id: "val_p_gift", label: "赠品惊喜" }, { id: "val_p_clear", label: "价格透明" },
      { id: "val_p_set", label: "套餐好" }, { id: "val_p_return", label: "值得回" },
    ],
  },
];

const RATING_LABELS: Record<number, string> = {
  1: "非常差", 2: "较差", 3: "一般", 4: "较好", 5: "非常好",
};

const DIMENSIONS_KEYWORDS = [
  { id: "food", label: "菜品质量", keyword: "菜品质量" },
  { id: "service", label: "服务表现", keyword: "服务表现" },
  { id: "env", label: "环境氛围", keyword: "环境氛围" },
  { id: "hygiene", label: "卫生安全", keyword: "卫生安全" },
  { id: "efficiency", label: "运营效率", keyword: "运营效率" },
  { id: "value", label: "价值体验", keyword: "价值体验" },
];

// ─── 词云组件（与OpinionBookDetail保持一致）──────────────────────────────────
function WordCloud({ tags }: { tags: Array<{ tag: string; count: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Array<{ tag: string; x: number; y: number; fontSize: number; opacity: number; fontWeight: number; rotate: number; color: string }>>([])
  useEffect(() => {
    if (!containerRef.current || tags.length === 0) { setPlaced([]); return; }
    const W = containerRef.current.offsetWidth;
    const H = containerRef.current.offsetHeight;
    if (W === 0 || H === 0) return;
    const maxCount = tags[0].count;
    const minCount = tags[tags.length - 1].count;
    const countRange = Math.max(maxCount - minCount, 1);
    const cx = W / 2; const cy = H / 2;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const result: typeof placed = [];
    // 颜色池：白色系 + 黄色点缀
    const colors = ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFE082", "#FFFFFF", "rgba(255,255,255,0.75)"];
    // 旋转角度池（只用少量旋转，避免太乱）
    const rotates = [0, 0, 0, -15, 15, -30, 30];
    tags.forEach(({ tag, count }, idx) => {
      const ratio = (count - minCount) / countRange;
      // 字体：9px ~ 30px，差距更大
      const fontSize = Math.round(9 + ratio * 21);
      // 透明度：0.45 ~ 1.0
      const opacity = 0.45 + ratio * 0.55;
      const fontWeight = ratio >= 0.75 ? 800 : ratio >= 0.45 ? 600 : 400;
      // 旋转：高频词不旋转，低频词随机旋转
      const rotate = ratio >= 0.7 ? 0 : rotates[idx % rotates.length];
      const color = colors[idx % colors.length];
      // 估算文字宽高（旋转后需要更大的碰撞盒）
      const tw = tag.length * fontSize * (rotate !== 0 ? 1.1 : 0.95);
      const th = fontSize * (rotate !== 0 ? 1.6 : 1.4);
      let placed_ok = false;
      const step = 2;
      const maxR = Math.min(W, H) * 0.52;
      for (let r = 0; r <= maxR && !placed_ok; r += step) {
        const angleCount = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r / (fontSize * 1.1)));
        const angleOffset = (idx * 137.508 * Math.PI) / 180;
        for (let ai = 0; ai < angleCount && !placed_ok; ai++) {
          const angle = angleOffset + (ai / angleCount) * 2 * Math.PI;
          const x = cx + r * Math.cos(angle) - tw / 2;
          const y = cy + r * Math.sin(angle) - th / 2;
          if (x < 0 || y < 0 || x + tw > W || y + th > H) continue;
          const overlap = rects.some(rc =>
            x < rc.x + rc.w + 3 && x + tw + 3 > rc.x && y < rc.y + rc.h + 3 && y + th + 3 > rc.y
          );
          if (!overlap) {
            rects.push({ x, y, w: tw, h: th });
            result.push({ tag, x, y, fontSize, opacity, fontWeight, rotate, color });
            placed_ok = true;
          }
        }
      }
    });
    setPlaced(result);
  }, [tags, containerRef.current?.offsetWidth, containerRef.current?.offsetHeight]);
  return (
    <div ref={containerRef} className="relative w-full flex-1 overflow-hidden">
      {placed.map((item, i) => (
        <span key={i} style={{
          position: "absolute", left: item.x, top: item.y,
          fontSize: item.fontSize, opacity: item.opacity, fontWeight: item.fontWeight,
          color: item.color, whiteSpace: "nowrap", lineHeight: 1.4,
          transform: item.rotate !== 0 ? `rotate(${item.rotate}deg)` : undefined,
          transformOrigin: "center center",
        }}>{item.tag}</span>
      ))}
    </div>
  );
}

// ─── 星级评分显示 ─────────────────────────────────────────────────────────────
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`w-3 h-3 ${s <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-100"}`} />
      ))}
    </div>
  );
}

// ─── 分店下拉 ─────────────────────────────────────────────────────────────────
function BranchDropdown({ branches, selectedBranchId, onSelect }: {
  branches: Array<{ id: number; name: string }>;
  selectedBranchId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = branches.find(b => b.id === selectedBranchId);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen(v => !v);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center justify-center gap-1 px-3 h-7 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#FFFFFF", minWidth: "90px" }}
      >
        <span className="whitespace-nowrap">{selected ? selected.name : "全部分店"}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            className="fixed rounded-xl shadow-xl overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", zIndex: 9999, width: "160px", top: dropPos.top, right: dropPos.right }}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 whitespace-nowrap"
              style={{ color: selectedBranchId === null ? "#D32F2F" : "#333" }}
              onClick={() => { onSelect(null); setOpen(false); }}
            >全部分店</button>
            {branches.map(b => (
              <button
                key={b.id}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 whitespace-nowrap"
                style={{ color: selectedBranchId === b.id ? "#D32F2F" : "#333" }}
                onClick={() => { onSelect(b.id); setOpen(false); }}
              >{b.name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 角色类型 ─────────────────────────────────────────────────────────────────
type Role = "guest" | "manager" | "owner";

const ROLE_CONFIG = {
  guest: { label: "顾客视角", icon: User, desc: "填写意见，享95折优惠" },
  manager: { label: "店长视角", icon: Briefcase, desc: "查看意见，隐私保护" },
  owner: { label: "老板视角", icon: Crown, desc: "完整数据，全局统计" },
};

// ─── 顾客视图 ─────────────────────────────────────────────────────────────────
function GuestView({ ledgerId, branches }: { ledgerId: number; branches: Array<{ id: number; name: string }> }) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>(undefined);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [selectedSubItems, setSelectedSubItems] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [guestName, setGuestName] = useState("");
  const [guestWechat, setGuestWechat] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [opinionOpen, setOpinionOpen] = useState(true);
  const [amount, setAmount] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [scanTime] = useState(() => new Date());

  const { data: info } = trpc.opinionBook.getPublicInfo.useQuery(
    { ledgerId, categoryId: selectedBranchId },
    { enabled: ledgerId > 0 }
  );

  const submitMutation = trpc.opinionBook.submitEntry.useMutation({
    onSuccess: () => { setSubmitted(true); setOpinionOpen(false); },
    onError: (e) => toast.error(e.message || "提交失败，请重试"),
  });

  const toggleDimension = (id: string) => {
    setSelectedDimensions(prev => {
      if (prev.includes(id)) {
        const dim = OPINION_DIMENSIONS.find(d => d.id === id);
        if (dim) {
          const subIds = [...dim.negItems, ...dim.posItems].map(s => s.id);
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

  const toggleSubItem = (id: string) => {
    setSelectedSubItems(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 5) { toast.error("最多上传5张图片"); return; }
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

  const handleSubmit = () => {
    if (selectedDimensions.length === 0 && selectedSubItems.length === 0 && !content.trim()) {
      toast.error("请至少选择一个维度或填写内容"); return;
    }
    const parts: string[] = [];
    selectedDimensions.forEach(dimId => {
      const dim = OPINION_DIMENSIONS.find(d => d.id === dimId);
      if (!dim) return;
      const allItems = [...dim.negItems, ...dim.posItems];
      const selectedSubs = allItems.filter(s => selectedSubItems.includes(s.id)).map(s => s.label);
      parts.push(selectedSubs.length > 0 ? `【${dim.label}】${selectedSubs.join("、")}` : `【${dim.label}】`);
    });
    if (content.trim()) parts.push(content.trim());
    const finalContent = parts.join(" ") || "（无文字内容）";
    submitMutation.mutate({
      ledgerId, categoryId: selectedBranchId, content: finalContent,
      rating: rating || undefined, guestName: guestName.trim() || undefined,
      guestWechat: guestWechat.trim() || undefined,
    });
  };

  const discountedAmount = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0
    ? (parseFloat(amount) * 0.95).toFixed(2) : null;

  const handleAlipayPay = async () => {
    if (!discountedAmount) { toast.error("请先输入消费金额"); return; }
    setPayLoading(true);
    try {
      const res = await fetch("/api/alipay/feedback-pay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(discountedAmount), ledgerId, subject: `麻六记-意见反馈95折优惠` }),
      });
      const data = await res.json();
      if (data.success && data.payUrl) { window.location.href = data.payUrl; }
      else { toast.error(data.error || "创建支付订单失败"); }
    } catch { toast.error("网络错误，请重试"); }
    finally { setPayLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部红色区 */}
      <div className="bg-[#D32F2F] px-4 py-3 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-3 -left-3 w-14 h-14 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs mb-0.5 truncate">麻六记 · 演示账本</p>
            <h1 className="text-white text-lg font-bold leading-tight">欢迎提意见</h1>

          </div>
          <div className="ml-3 flex-shrink-0">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/maluji-logo_6fe47d51.png" alt="麻六记" className="w-16 h-16 object-contain drop-shadow-lg rounded-full" />
          </div>
        </div>
      </div>

      {/* 分店选择 */}
      {/* 顾客视角不显示门店选择（顾客扫码时已自动识别门店） */}

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-3">
        {/* 意见填写区 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50" onClick={() => setOpinionOpen(v => !v)}>
            <div className="flex items-center gap-2">
              {submitted ? <CheckCircle className="w-4 h-4 text-green-500" /> : <MessageSquare className="w-4 h-4 text-[#D32F2F]" />}
              <span className="font-semibold text-sm text-gray-800">{submitted ? "意见已提交，感谢您！" : "这次用餐体验，哪方面还可以改进？"}</span>
            </div>
            {opinionOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {opinionOpen && !submitted && (
            <div className="px-4 pb-4 space-y-5 border-t border-gray-50">
              <div className="pt-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {OPINION_DIMENSIONS.map(dim => {
                    const isSelected = selectedDimensions.includes(dim.id);
                    return (
                      <button key={dim.id} onClick={() => toggleDimension(dim.id)}
                        className={`relative py-2 rounded-md text-xs font-semibold text-center transition-all border ${isSelected ? "bg-[#FFF5F5] border-[#D32F2F] text-[#D32F2F]" : "bg-gray-50 border-gray-200 text-gray-700 active:bg-gray-100"}`}>
                        {dim.label}
                        {isSelected && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#D32F2F] rounded-full flex items-center justify-center"><span className="text-white text-[9px] font-bold">✓</span></span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDimensions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">您的感受（可多选）</p>
                  {selectedDimensions.map(dimId => {
                    const dim = OPINION_DIMENSIONS.find(d => d.id === dimId);
                    if (!dim) return null;
                    const isExpanded = expandedDimension === dimId;
                    const negCount = dim.negItems.filter(s => selectedSubItems.includes(s.id)).length;
                    const posCount = dim.posItems.filter(s => selectedSubItems.includes(s.id)).length;
                    return (
                      <div key={dimId} className="rounded-xl overflow-hidden border border-gray-100">
                        <button className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 active:bg-gray-100" onClick={() => setExpandedDimension(isExpanded ? null : dimId)}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">{dim.label}</span>
                            {negCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>待改进 {negCount}</span>}
                            {posCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E8F5E9", color: "#2E7D32" }}>好评 {posCount}</span>}
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-2 py-2">
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                              {/* 左列：需要改进 */}
                              <div className="border-r border-dashed border-gray-100 pr-2">
                                <p className="text-[10px] text-red-400 font-medium mb-1.5 flex items-center gap-1">
                                  <span className="inline-block w-1 h-1 rounded-full bg-red-400"></span>
                                  需要改进
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {dim.negItems.map(sub => {
                                    const isSubSelected = selectedSubItems.includes(sub.id);
                                    return (
                                      <button key={sub.id} onClick={() => toggleSubItem(sub.id)}
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium border transition-all ${isSubSelected ? "bg-[#D32F2F] text-white border-[#D32F2F]" : "bg-white text-gray-600 border-gray-200 active:bg-gray-50"}`}>
                                        {sub.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {/* 右列：值得表扬 */}
                              <div className="pl-0">
                                <p className="text-[10px] text-green-500 font-medium mb-1.5 flex items-center gap-1">
                                  <span className="inline-block w-1 h-1 rounded-full bg-green-400"></span>
                                  值得表扬
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {dim.posItems.map(sub => {
                                    const isSubSelected = selectedSubItems.includes(sub.id);
                                    return (
                                      <button key={sub.id} onClick={() => toggleSubItem(sub.id)}
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium border transition-all ${isSubSelected ? "bg-[#2E7D32] text-white border-[#2E7D32]" : "bg-white text-gray-600 border-gray-200 active:bg-gray-50"}`}>
                                        {sub.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">拍照（最多5张，可选）</p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-100">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => { setImages(p => p.filter((_, i) => i !== idx)); setImageFiles(p => p.filter((_, i) => i !== idx)); }} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5 text-gray-400 active:bg-gray-50">
                      <Camera className="w-5 h-5" />
                      <span className="text-xs">{images.length}/5</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleImageSelect} />
                </div>
                <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="如果今天只能改进一点，你希望是什么？" className="min-h-[80px] text-sm resize-none bg-gray-50 border-gray-100" maxLength={500} />
                <p className="text-xs text-gray-300 text-right mt-0.5">{content.length}/500</p>
              </div>

              <div className="flex gap-2">
                <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="您的称谓（可选）" className="flex-1 text-sm bg-gray-50 border-gray-100" maxLength={20} />
                <Input value={guestWechat} onChange={e => setGuestWechat(e.target.value)} placeholder="微信号（可选）" className="flex-1 text-sm bg-gray-50 border-gray-100" maxLength={30} />
              </div>

              <Button className="w-full h-12 text-base font-bold bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-100" disabled={submitMutation.isPending} onClick={handleSubmit}>
                {submitMutation.isPending ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />提交中...</span> : "提交意见，解锁 95 折优惠"}
              </Button>
            </div>
          )}

          {submitted && (
            <div className="px-5 py-4 border-t border-gray-50">
              <p className="text-[15px] font-medium text-gray-700 leading-snug">感谢您的反馈，您的意见已收到，老板会亲自查看。</p>
              <button className="mt-3 text-xs text-gray-400" onClick={() => { setSubmitted(false); setSelectedDimensions([]); setSelectedSubItems([]); setExpandedDimension(null); setContent(""); setRating(0); setGuestName(""); setGuestWechat(""); setImages([]); setImageFiles([]); setOpinionOpen(true); }}>再次提交意见</button>
            </div>
          )}
        </div>

        {/* 支付区 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <p className="text-xs text-gray-400 mb-1">{submitted ? "已享95折优惠" : "提交意见后享95折优惠"}</p>
            <p className="text-[13px] font-semibold text-gray-700">本次消费金额</p>
          </div>
          <div className="px-5 pb-5">
            <div className="mb-4 bg-gray-50 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">扫码时间</span>
                <span className="text-gray-700">{scanTime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div className="flex items-end gap-1 mb-4 border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-xl mb-0.5">¥</span>
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="flex-1 text-[40px] font-light text-gray-900 bg-transparent border-0 outline-none leading-none placeholder:text-gray-200" />
            </div>
            {discountedAmount ? (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-sm"><span className="text-gray-500">原价</span><span className="text-gray-700">¥{parseFloat(amount).toFixed(2)}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-gray-500">95折优惠</span><span className="text-[#1677FF]">-¥{(parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)}</span></div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-2"><span className="text-sm font-semibold text-gray-800">实付金额</span><span className="text-xl font-bold text-gray-900">¥{discountedAmount}</span></div>
              </div>
            ) : (
              <div className="mb-4 text-center py-2"><p className="text-sm text-gray-400">输入金额后自动计算95折优惠</p></div>
            )}
            <button onClick={handleAlipayPay} disabled={!discountedAmount || payLoading || !submitted}
              className={`w-full py-3.5 rounded-full font-semibold text-[15px] transition-all ${discountedAmount && !payLoading && submitted ? "bg-[#1677FF] text-white active:opacity-80" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {payLoading ? "订单创建中..." : !submitted ? "请先提交意见解锁优惠" : discountedAmount ? `支付宝付款  ¥${discountedAmount}` : "输入金额后付款"}
            </button>
            {!submitted && <p className="text-xs text-center text-gray-400 mt-2">提交意见后，支付按钮自动解锁</p>}
          </div>
        </div>
        <p className="text-xs text-center text-gray-400 pb-2">您的意见将匿名提交，感谢您的参与</p>
      </div>
    </div>
  );
}

// ─── 管理者视图（店长/老板共用，通过isOwner控制隐私字段）────────────────────
function ManagerView({ ledgerId, isOwner, branches }: { ledgerId: number; isOwner: boolean; branches: Array<{ id: number; name: string }> }) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // 使用公开接口获取意见列表（演示账本无需登录）
  const { data: entriesData, isLoading, error, refetch } = trpc.opinionBook.getDemoEntries.useQuery(
    { ledgerId, pageSize: 500, isOwner },
    { enabled: ledgerId > 0, retry: 1 }
  );

  const entries = useMemo(() => {
    if (!entriesData || !Array.isArray((entriesData as any).entries)) return [];
    return (entriesData as any).entries.map((e: any) => ({
      id: e.id, content: e.content || "", created_at: e.created_at,
      branch_name: e.branch_name || null, rating: e.rating || null,
      guest_name: isOwner ? (e.guest_name || null) : null,
      guest_wechat: isOwner ? (e.guest_wechat || null) : null,
      is_read: e.is_read || false,
    }));
  }, [entriesData, isOwner]);

  // 统计数据
  const stats = useMemo(() => {
    const total = entries.length;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    let todayCount = 0, weekCount = 0;
    const dimCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    entries.forEach(e => {
      const t = new Date(e.created_at).getTime();
      if (t >= todayStart) todayCount++;
      if (t >= weekStart) weekCount++;
      DIMENSIONS_KEYWORDS.forEach(d => { if (e.content.includes(d.keyword)) dimCounts[d.id] = (dimCounts[d.id] || 0) + 1; });
      const tagMatches = e.content.match(/【([^】]+)】/g) || [];
      tagMatches.forEach(m => { const tag = m.slice(1, -1); tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
    });

    const dimPieData = DIMENSIONS_KEYWORDS
      .filter(d => dimCounts[d.id])
      .map(d => ({ id: d.id, label: d.label, count: dimCounts[d.id], pct: total > 0 ? Math.round((dimCounts[d.id] / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    const tagCloud = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 30);

    return { total, todayCount, weekCount, dimPieData, tagCloud };
  }, [entries]);

  const branchFilteredEntries = selectedBranchId !== null
    ? entries.filter(e => {
        const branch = branches.find(b => b.id === selectedBranchId);
        return branch && e.branch_name && e.branch_name.startsWith(branch.name);
      })
    : entries;

  const filteredEntries = searchKeyword
    ? branchFilteredEntries.filter(e => e.content.toLowerCase().includes(searchKeyword.toLowerCase()))
    : branchFilteredEntries;

  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#FAF3ED" }}>
      {/* 红色区域 */}
      <div className="flex-none overflow-hidden flex flex-col" style={{ height: "40vh", backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-shrink-0">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/maluji-logo_6fe47d51.png" alt="麻六记" className="w-10 h-10 object-contain" />
            </div>
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">{isOwner ? "老板视角" : "店长视角"}</div>
              <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.75)" }}>麻六记 · 演示账本</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setShowSearch(true)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Search className="w-3.5 h-3.5 text-white" />
              </button>
              {isOwner ? (
                <div className="flex items-center gap-1 px-2 h-7 rounded-full text-xs" style={{ backgroundColor: "rgba(255,215,0,0.25)", color: "#FFD700" }}>
                  <Eye className="w-3 h-3" /> 完整数据
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 h-7 rounded-full text-xs" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>
                  <EyeOff className="w-3 h-3" /> 隐私保护
                </div>
              )}
              <BranchDropdown branches={branches} selectedBranchId={selectedBranchId} onSelect={setSelectedBranchId} />
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 pb-3 overflow-hidden flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div className="text-2xl font-bold leading-none">{stats.total}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>总意见数</div>
            </div>
            <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div className="text-2xl font-bold leading-none">{stats.todayCount}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>今日新增</div>
            </div>
            <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div className="text-2xl font-bold leading-none">{stats.weekCount}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>近7天</div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-2 overflow-hidden">
            <div className="rounded-xl px-3 py-2 flex flex-col overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
              <div className="text-xs font-medium flex-shrink-0 mb-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>建议排行</div>
              {stats.dimPieData.length === 0 ? (
                <div className="text-xs flex-1 flex items-center" style={{ color: "rgba(255,255,255,0.5)" }}>暂无数据</div>
              ) : (
                <div className="flex-1 flex flex-col justify-around overflow-hidden" style={{ gap: "2px" }}>
                  {stats.dimPieData.slice(0, 6).map((seg, idx) => {
                    const maxPct = stats.dimPieData[0].pct;
                    const barW = Math.max(6, Math.round((seg.pct / maxPct) * 100));
                    const isTop = idx === 0;
                    return (
                      <div key={seg.id} className="flex flex-col" style={{ gap: "2px" }}>
                        <div className="flex items-center justify-between">
                          <span style={{ color: isTop ? "#FFFFFF" : "rgba(255,255,255,0.8)", fontSize: "9.5px", fontWeight: isTop ? 700 : 400, lineHeight: 1.2 }}>
                            {isTop && <span style={{ marginRight: "2px", fontSize: "8px" }}>▲</span>}{seg.label}
                          </span>
                          <span style={{ color: isTop ? "#FFFFFF" : "rgba(255,255,255,0.85)", fontSize: "10px", fontWeight: isTop ? 700 : 600 }}>{seg.pct}%</span>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: isTop ? "5px" : "4px", backgroundColor: "rgba(255,255,255,0.15)" }}>
                          <div className="h-full rounded-full" style={{ width: `${barW}%`, backgroundColor: isTop ? "#FFFFFF" : "rgba(255,255,255,0.6)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-xl px-2 py-2 flex flex-col overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.12)", minHeight: "120px" }}>
              <div className="text-xs font-medium flex-shrink-0 mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>热词</div>
              {stats.tagCloud.length === 0 ? (
                <div className="text-xs flex-1 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.4)" }}>暂无标签</div>
              ) : (
                <WordCloud tags={stats.tagCloud} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 意见列表 */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ height: "60vh" }}>
        <div className="px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0" style={{ backgroundColor: "#FAF3ED", borderBottom: "1px solid #EEE5DC" }}>
          <span className="text-gray-500">
            共 <span className="font-semibold" style={{ color: "#D32F2F" }}>{filteredEntries.length}</span> 条意见
            {selectedBranchId !== null && selectedBranch && <span className="ml-1" style={{ color: "#D32F2F" }}>· {selectedBranch.name}</span>}
          </span>
          {!isOwner && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F5F5F5", color: "#9E9E9E" }}>顾客隐私信息已隐藏</span>}
          {searchKeyword && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }} onClick={() => setSearchKeyword("")}>
              "{searchKeyword}" ×
            </span>
          )}
          <button onClick={() => refetch()} className="ml-auto" style={{ color: "#BDBDBD" }}><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center justify-center py-16 text-red-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm text-red-500 mb-2">{(error as any)?.message || '加载失败'}</p>
              <button onClick={() => refetch()} className="text-xs px-4 py-1.5 rounded-full" style={{ backgroundColor: '#FFEBEE', color: '#D32F2F' }}>重试</button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">加载中...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{searchKeyword ? "没有匹配的意见" : "暂无意见"}</p>
            </div>
          ) : (
            <div className="px-4 pt-3 pb-4">
              <div className="relative">
                <div className="absolute left-[7px] top-0 bottom-0 w-0.5" style={{ backgroundColor: "#E0E0E0" }} />
                <div className="space-y-0">
                  {filteredEntries.map((entry: any) => (
                    <div key={entry.id} className="relative flex gap-3 pb-3">
                      <div className="flex-shrink-0 w-3.5 h-3.5 rounded-full mt-2 z-10 border-2" style={{ backgroundColor: entry.is_read ? "#E0E0E0" : "#D32F2F", borderColor: "#FAF3ED" }} />
                      <div className="flex-1 rounded-xl p-3 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {(() => { const d = new Date(entry.created_at); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })()}
                          </span>
                          {entry.branch_name && entry.branch_name !== "未分类" && (() => {
                            const parts = entry.branch_name.split('-');
                            return (
                              <span className="text-xs flex items-center gap-1 flex-shrink-0">
                                <span className="font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>{parts[0]}</span>
                                {parts[1] && <span className="font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}>{parts[1]}</span>}
                              </span>
                            );
                          })()}
                          {entry.rating && <StarRating rating={entry.rating} />}
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">{entry.content}</p>
                        {isOwner && (entry.guest_name || entry.guest_wechat) && (
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                            {entry.guest_name && <span className="text-xs" style={{ color: "#9E9E9E" }}>称谓：{entry.guest_name}</span>}
                            {entry.guest_wechat && <span className="text-xs" style={{ color: "#9E9E9E" }}>微信：{entry.guest_wechat}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 shadow-xl">
            <p className="text-sm font-semibold text-gray-700 mb-3">搜索意见</p>
            <Input autoFocus value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="输入关键词..." className="mb-3" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSearch(false)}>取消</Button>
              <Button className="flex-1 bg-[#D32F2F] hover:bg-red-700 text-white" onClick={() => setShowSearch(false)}>搜索</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主演示页面 ───────────────────────────────────────────────────────────────
export default function DemoOpinionBook() {
  const params = useParams<{ bookId: string }>();
  const ledgerId = parseInt(params.bookId || "0");
  const [role, setRole] = useState<Role>("guest");

  // 获取分店列表（公开接口）
  const { data: allCategories = [] } = trpc.ledger.getPublicCategories.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  const branches = useMemo(() =>
    (allCategories as any[]).filter((c: any) => c.parentId === null && !c.isDefault).map((c: any) => ({ id: c.id, name: c.name })),
    [allCategories]
  );

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: "麻六记意见簿演示", text: "体验麻六记意见簿系统，切换老板/店长/顾客三个视角", url });
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success("链接已复制到剪贴板")).catch(() => toast.error("复制失败，请手动复制链接"));
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* 角色切换栏（固定在顶部） */}
      <div className="flex-none z-50" style={{ backgroundColor: "#111111" }}>
        <div className="flex items-center px-3 py-2.5 gap-2">
          {/* 角色切换按钮 - 只保留文字 */}
          <div className="flex-1 flex gap-2">
            {(Object.keys(ROLE_CONFIG) as Role[]).map(r => {
              const cfg = ROLE_CONFIG[r];
              const isActive = role === r;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="flex-1 py-2 rounded-lg transition-all text-sm font-semibold"
                  style={{
                    backgroundColor: isActive ? "#D32F2F" : "rgba(255,255,255,0.07)",
                    color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* 分享按钮 */}
          <button onClick={handleShare} className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
            <Share2 className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>


      </div>

      {/* 内容区域 */}
      <div className="flex-1" style={{ overflow: role === 'guest' ? 'auto' : 'hidden' }}>
        {role === "guest" && <GuestView ledgerId={ledgerId} branches={branches} />}
        {role === "manager" && <ManagerView ledgerId={ledgerId} isOwner={false} branches={branches} />}
        {role === "owner" && <ManagerView ledgerId={ledgerId} isOwner={true} branches={branches} />}
      </div>
    </div>
  );
}
