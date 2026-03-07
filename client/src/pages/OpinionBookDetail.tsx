/**
 * OpinionBookDetail.tsx - AB 型定制账本（意见本）管理者查看页面
 * 布局：红色区域 2/5（头像+操作栏+数据概览）+ 意见列表 3/5
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Settings, Star, ChevronDown, ChevronRight, MessageSquare, RefreshCw, ChevronUp } from "lucide-react";

// ─── 多角色体验标记解析 ────────────────────────────────────────────────────────
// description 中含 __DEMO_MULTI_ROLE__:原始账本ID 即为体验版
const DEMO_MARKER = "__DEMO_MULTI_ROLE__";
function parseDemoMarker(description?: string | null): { isDemo: boolean; sourceLedgerId: number | null } {
  if (!description) return { isDemo: false, sourceLedgerId: null };
  const match = description.match(/__DEMO_MULTI_ROLE__:(\d+)/);
  if (match) return { isDemo: true, sourceLedgerId: parseInt(match[1]) };
  if (description.includes(DEMO_MARKER)) return { isDemo: true, sourceLedgerId: null };
  return { isDemo: false, sourceLedgerId: null };
}

// ─── 角色定义 ─────────────────────────────────────────────────────────────────
type DemoRole = "owner" | "manager" | "guest";
const DEMO_ROLES: { id: DemoRole; label: string; sub: string; color: string; activeBg: string }[] = [
  { id: "owner",   label: "老板视角", sub: "完整权限", color: "#B71C1C", activeBg: "#FAF3ED" },
  { id: "manager", label: "店长视角", sub: "管理权限", color: "#E65100", activeBg: "#FAF3ED" },
  { id: "guest",   label: "客人视角", sub: "提交反馈", color: "#1565C0", activeBg: "#FAF3ED" },
];

// ─── 意见维度（与 FeedbackPage 保持一致）─────────────────────────────────────
const DEMO_DIMENSIONS = [
  { id: "food",       label: "菜品质量", desc: "口味、食材、分量",   subItems: ["太咸","太淡","太油腻","太甜","食材不新鲜","有异味","温度不对","分量不足"] },
  { id: "service",    label: "服务表现", desc: "态度、响应、专业度", subItems: ["响应太慢","态度不好","不了解菜品","不够主动","点单出错","结账不顺畅"] },
  { id: "env",        label: "环境氛围", desc: "装修、舒适度、噪音", subItems: ["噪音太大","灯光刺眼","空调不适","座椅不舒适","有油烟/异味"] },
  { id: "hygiene",    label: "卫生安全", desc: "餐具、桌面、洗手间", subItems: ["餐具不干净","桌面不干净","洗手间脏乱","员工仪容不整"] },
  { id: "efficiency", label: "运营效率", desc: "上菜速度、预约流程", subItems: ["上菜太慢","漏单","等位时间长","预约流程繁琐"] },
  { id: "value",      label: "价值感",   desc: "性价比、定价合理性", subItems: ["整体偏贵","酒水定价过高","有隐性消费","不值这个价"] },
];
const RATING_LABELS = ["", "很差", "较差", "一般", "满意", "非常满意"];

// ─── 客人视角模拟组件 ─────────────────────────────────────────────────────────
function GuestViewSimulator({ ledgerName }: { ledgerName: string }) {
  const [selDims, setSelDims] = useState<string[]>([]);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [selSubs, setSelSubs] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestWechat, setGuestWechat] = useState("");
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [opinionOpen, setOpinionOpen] = useState(true);

  const discountedAmount = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0
    ? (parseFloat(amount) * 0.95).toFixed(2) : null;

  const toggleDim = (id: string) => {
    setSelDims(prev => {
      if (prev.includes(id)) {
        setExpandedDim(e => e === id ? null : e);
        return prev.filter(d => d !== id);
      } else {
        setExpandedDim(id);
        return [...prev, id];
      }
    });
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "#F5F5F5" }}>
      {/* 顶部红色区 */}
      <div className="bg-[#D32F2F] px-4 py-3 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-3 -left-3 w-14 h-14 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative z-10">
          <p className="text-white/70 text-xs mb-0.5 truncate">{ledgerName}</p>
          <h2 className="text-white text-lg font-bold leading-tight">欢迎提意见</h2>
          <p className="text-white/70 text-xs mt-0.5">提交后享 <span className="text-yellow-300 font-semibold">95折</span> 优惠</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-3">
        {/* 意见填写区 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
            onClick={() => setOpinionOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#D32F2F]" />
              <span className="font-semibold text-sm text-gray-800">
                {submitted ? "意见已提交，感谢您！" : "填写意见（提交后享95折）"}
              </span>
            </div>
            {opinionOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {opinionOpen && !submitted && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50">
              {/* 维度选择 */}
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2.5 uppercase tracking-wide">这次体验，哪方面需要改进？（可多选）</p>
                <div className="grid grid-cols-3 gap-2">
                  {DEMO_DIMENSIONS.map(dim => {
                    const isSel = selDims.includes(dim.id);
                    return (
                      <button key={dim.id} onClick={() => toggleDim(dim.id)}
                        className={`relative flex flex-col items-center justify-center py-3 px-1 rounded-xl text-center border-2 ${
                          isSel ? "bg-[#FFF5F5] border-[#D32F2F]" : "bg-gray-50 border-gray-100"
                        }`}>
                        <span className={`text-xs font-semibold leading-tight ${isSel ? "text-[#D32F2F]" : "text-gray-700"}`}>{dim.label}</span>
                        <span className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate w-full text-center px-1">{dim.desc}</span>
                        {isSel && <span className="absolute top-1 right-1 w-4 h-4 bg-[#D32F2F] rounded-full flex items-center justify-center"><span className="text-white text-[10px] font-bold">✓</span></span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 子维度 */}
              {selDims.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">具体问题（可多选）</p>
                  {selDims.map(dimId => {
                    const dim = DEMO_DIMENSIONS.find(d => d.id === dimId);
                    if (!dim) return null;
                    const isExp = expandedDim === dimId;
                    const selCount = dim.subItems.filter(s => selSubs.includes(`${dimId}:${s}`)).length;
                    return (
                      <div key={dimId} className="rounded-xl overflow-hidden border border-gray-100">
                        <button className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50"
                          onClick={() => setExpandedDim(isExp ? null : dimId)}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">{dim.label}</span>
                            {selCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>已选 {selCount}</span>}
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExp ? "rotate-90" : ""}`} />
                        </button>
                        {isExp && (
                          <div className="px-3 py-3 flex flex-wrap gap-2">
                            {dim.subItems.map(sub => {
                              const key = `${dimId}:${sub}`;
                              const isSel = selSubs.includes(key);
                              return (
                                <button key={key} onClick={() => setSelSubs(prev => isSel ? prev.filter(s => s !== key) : [...prev, key])}
                                  className={`px-3 py-1.5 rounded-full text-sm border ${
                                    isSel ? "bg-[#D32F2F] text-white border-[#D32F2F]" : "bg-white text-gray-600 border-gray-200"
                                  }`}>{sub}</button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 评分 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">整体评分（可选）</p>
                <div className="flex gap-2 justify-center">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(rating === s ? 0 : s)} className="transition-transform active:scale-90">
                      <Star className={`w-9 h-9 transition-colors ${
                        s <= (hoverRating || rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-100"
                      }`} />
                    </button>
                  ))}
                </div>
                {rating > 0 && <p className="text-xs text-center text-gray-500 mt-1">{RATING_LABELS[rating]}</p>}
              </div>

              {/* 补充说明 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">补充说明（可选）</p>
                <textarea value={content} onChange={e => setContent(e.target.value)}
                  placeholder="如果今天只能改进一点，你希望是什么？"
                  className="w-full min-h-[80px] text-sm resize-none bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 outline-none"
                  maxLength={500} />
                <p className="text-xs text-gray-300 text-right mt-0.5">{content.length}/500</p>
              </div>

              {/* 称谓 + 微信 */}
              <div className="flex gap-2">
                <input value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="您的称谓（可选）"
                  className="flex-1 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 outline-none" maxLength={20} />
                <input value={guestWechat} onChange={e => setGuestWechat(e.target.value)}
                  placeholder="微信号（可选）"
                  className="flex-1 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 outline-none" maxLength={30} />
              </div>

              {/* 提交按钮（模拟，不真实提交） */}
              <button
                className="w-full h-12 text-base font-bold text-white rounded-xl shadow-md"
                style={{ backgroundColor: "#D32F2F" }}
                onClick={() => setSubmitted(true)}
              >
                提交意见，解锁 95 折优惠
              </button>
              <p className="text-xs text-center text-amber-500">【体验模式·不会真实提交数据】</p>
            </div>
          )}

          {submitted && (
            <div className="px-5 py-4 border-t border-gray-50">
              <p className="text-[15px] font-medium text-gray-700 leading-snug">感谢您的反馈，您的意见已收到，老板会亲自查看。</p>
              <button className="mt-3 text-xs text-gray-400" onClick={() => { setSubmitted(false); setSelDims([]); setSelSubs([]); setContent(""); setRating(0); }}>再次提交意见</button>
            </div>
          )}
        </div>

        {/* 支付区（模拟） */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <p className="text-xs text-gray-400 mb-1">{submitted ? "已享95折优惠" : "提交意见后享95折优惠"}</p>
            <p className="text-[13px] font-semibold text-gray-700">本次消费金额</p>
          </div>
          <div className="px-5 pb-5">
            <div className="flex items-end gap-1 mb-4 border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-xl mb-0.5">¥</span>
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 text-[40px] font-light text-gray-900 bg-transparent border-0 outline-none leading-none placeholder:text-gray-200" />
            </div>
            {discountedAmount ? (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">原价</span><span className="text-gray-700">¥{parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">95折优惠</span><span className="text-[#1677FF]">-¥{(parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="text-sm font-semibold text-gray-800">实付金额</span>
                  <span className="text-xl font-bold text-gray-900">¥{discountedAmount}</span>
                </div>
              </div>
            ) : (
              <div className="mb-4 text-center py-2"><p className="text-sm text-gray-400">输入金额后自动计算95折优惠</p></div>
            )}
            <button
              disabled={!discountedAmount || !submitted}
              className={`w-full py-3.5 rounded-full font-semibold text-[15px] ${
                discountedAmount && submitted ? "bg-[#1677FF] text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {!submitted ? "请先提交意见解锁优惠" : discountedAmount ? `支付宝付款  ¥${discountedAmount}` : "输入金额后付款"}
            </button>
            <p className="text-xs text-center text-amber-500 mt-2">【体验模式·支付功能真实可用】</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 词云组件（螺旋扩散，最大词在中心）─────────────────────────────────────────
function WordCloud({ tags }: { tags: Array<{ tag: string; count: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Array<{ tag: string; x: number; y: number; fontSize: number; opacity: number; fontWeight: number }>>([]);

  useEffect(() => {
    if (!containerRef.current || tags.length === 0) { setPlaced([]); return; }
    const W = containerRef.current.offsetWidth;
    const H = containerRef.current.offsetHeight;
    if (W === 0 || H === 0) return;

    const maxCount = tags[0].count;
    const cx = W / 2;
    const cy = H / 2;

    // 碰撞检测矩形列表
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];

    const result: typeof placed = [];

    tags.forEach(({ tag, count }) => {
      const ratio = count / maxCount;
      const fontSize = Math.round(10 + ratio * 10); // 10px ~ 20px
      const opacity = 0.5 + ratio * 0.5;
      const fontWeight = ratio >= 0.8 ? 700 : ratio >= 0.5 ? 600 : 400;
      // 估算文字宽高（中文字符约 fontSize*0.95 宽）
      const tw = tag.length * fontSize * 0.95;
      const th = fontSize * 1.4;

      // 螺旋搜索：从中心向外
      let placed_ok = false;
      const step = 2;
      const maxR = Math.min(W, H) * 0.52;
      for (let r = 0; r <= maxR && !placed_ok; r += step) {
        // 每圈均匀分布角度，r越大角度越多
        const angleCount = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r / (fontSize * 1.2)));
        // 加一个随机偏移让每圈起始角不同
        const angleOffset = (count * 137.5 * Math.PI) / 180;
        for (let ai = 0; ai < angleCount && !placed_ok; ai++) {
          const angle = angleOffset + (ai / angleCount) * 2 * Math.PI;
          const x = cx + r * Math.cos(angle) - tw / 2;
          const y = cy + r * Math.sin(angle) - th / 2;
          // 边界检查
          if (x < 0 || y < 0 || x + tw > W || y + th > H) continue;
          // 碰撞检查
          const overlap = rects.some(rc =>
            x < rc.x + rc.w + 2 && x + tw + 2 > rc.x &&
            y < rc.y + rc.h + 2 && y + th + 2 > rc.y
          );
          if (!overlap) {
            rects.push({ x, y, w: tw, h: th });
            result.push({ tag, x, y, fontSize, opacity, fontWeight });
            placed_ok = true;
          }
        }
      }
      // 放不下就跳过
    });

    setPlaced(result);
  }, [tags, containerRef.current?.offsetWidth, containerRef.current?.offsetHeight]);

  return (
    <div ref={containerRef} className="relative w-full flex-1 overflow-hidden">
      {placed.map((item, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: item.x,
            top: item.y,
            fontSize: item.fontSize,
            opacity: item.opacity,
            fontWeight: item.fontWeight,
            color: "#FFFFFF",
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {item.tag}
        </span>
      ))}
    </div>
  );
}

// ─── 星级展示 ─────────────────────────────────────────────────────────────────
function StarRating({ rating }: { rating?: number }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3 h-3 ${s <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
        />
      ))}
    </div>
  );
}

// ─── 分店下拉选择器 ────────────────────────────────────────────────────────────
function BranchDropdown({
  branches,
  selectedBranchId,
  onSelect,
}: {
  branches: Array<{ id: number; name: string }>;
  selectedBranchId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const label = selectedBranchId === null ? "全部分店" : (selectedBranch?.name || "未知分店");

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
        style={{
          backgroundColor: selectedBranchId !== null ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)",
          color: selectedBranchId !== null ? "#D32F2F" : "#FFFFFF",
          border: selectedBranchId !== null ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.2)",
          minWidth: "80px",
          justifyContent: "center",
        }}
      >
        <span className="truncate max-w-[80px]">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border border-gray-100 py-1 min-w-[140px] max-h-[240px] overflow-y-auto"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm ${selectedBranchId === null ? "font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
              style={selectedBranchId === null ? { color: "#D32F2F", backgroundColor: "#FFF5F5" } : {}}
            >
              全部分店
            </button>
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => { onSelect(b.id); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm ${selectedBranchId === b.id ? "font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                style={selectedBranchId === b.id ? { color: "#D32F2F", backgroundColor: "#FFF5F5" } : {}}
              >
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 搜索弹窗 ────────────────────────────────────────────────────────────────
function SearchDialog({ keyword, onSearch, onClose }: { keyword: string; onSearch: (kw: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(keyword);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-sm p-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onSearch(value); onClose(); } }}
          placeholder="搜索意见内容..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <div className="flex gap-2 mt-3 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={() => { onSearch(value); onClose(); }} className="px-4 py-1.5 text-sm text-white rounded-lg" style={{ backgroundColor: "#D32F2F" }}>搜索</button>
        </div>
      </div>
    </div>
  );
}

/// ─── 主页面 ─────────────────────────────────────────────────────────────────
export default function OpinionBookDetail() {
  const params = useParams<{ bookId: string }>();
  const ledgerId = parseInt(params.bookId || "0");
  const [, setLocation] = useLocation();

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  // 多角色体验模式状态
  const [demoRole, setDemoRole] = useState<DemoRole>("owner");

  const { data: user } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId }, { enabled: ledgerId > 0 });
  const { data: allCategories = [] } = trpc.ledger.getCategories.useQuery({ ledgerId }, { enabled: ledgerId > 0 });

  // 解析 Demo 标记
  const demoInfo = useMemo(() => parseDemoMarker((ledgerData as any)?.description), [ledgerData]);
  const isDemo = demoInfo.isDemo;
  const sourceLedgerId = demoInfo.sourceLedgerId;

  // 获取原始账本信息（体验版需要显示来源）
  const { data: sourceLedgerData } = trpc.ledger.getById.useQuery(
    { ledgerId: sourceLedgerId! },
    { enabled: isDemo && sourceLedgerId !== null }
  );

  const branches = (allCategories as any[])
    .filter((c: any) => c.parentId === null && !c.isDefault)
    .map((c: any) => ({ id: c.id, name: c.name }));

  // 体验模式：从原始账本读取数据，并按角色过滤隐私字段
  const queryLedgerId = isDemo && sourceLedgerId ? sourceLedgerId : ledgerId;
  const queryDemoRole = isDemo && demoRole !== "guest" ? (demoRole as "owner" | "manager") : undefined;

  const { data: entriesData, isLoading, refetch } = trpc.opinionBook.getEntries.useQuery(
    {
      ledgerId: queryLedgerId,
      pageSize: 500,
      ...(isDemo && demoRole !== "guest" ? { demoRole: queryDemoRole } : {}),
      // 如果是体验版账本，传入原始账本 ID 以通过权限检查
      ...(isDemo && sourceLedgerId ? { sourceLedgerId } : {}),
    },
    { enabled: ledgerId > 0 && (!isDemo || demoRole !== "guest") }
  );

  // 展平所有意见记录
  const entries = useMemo(() => {
    if (!entriesData || !Array.isArray((entriesData as any).entries)) return [];
    return (entriesData as any).entries.map((e: any) => ({
      id: e.id,
      content: e.content || "",
      created_at: e.created_at,
      branch_name: e.branch_name || null,
      rating: e.rating || null,
      guest_name: e.guest_name || null,
      guest_wechat: e.guest_wechat || null,
      is_read: e.is_read || false,
    }));
  }, [entriesData]);;

  // ─── 六大维度定义 ────────────────────────────────────────────────────────────
  const DIMENSIONS = [
    { id: "food",       label: "菜品质量", keyword: "菜品质量" },
    { id: "service",    label: "服务表现", keyword: "服务表现" },
    { id: "env",        label: "环境氛围", keyword: "环境氛围" },
    { id: "hygiene",    label: "卫生安全", keyword: "卫生安全" },
    { id: "efficiency", label: "运营效率", keyword: "运营效率" },
    { id: "value",      label: "价值感",   keyword: "价值感" },
  ];
  // 饼图颜色：同一红色系深浅渐变
  const DIM_COLORS = ["#FFFFFF", "rgba(255,255,255,0.75)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.38)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0.12)"];

  // ─── 数据概览统计（基于全量 entries）─────────────────────────────────────────
  const stats = useMemo(() => {
    const total = entries.length;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

    let todayCount = 0;
    let weekCount = 0;

    // 六大维度计数
    const dimCountMap: Record<string, number> = {};
    DIMENSIONS.forEach(d => { dimCountMap[d.id] = 0; });

    entries.forEach((e: any) => {
      const t = new Date(e.created_at).getTime();
      if (t >= todayStart) todayCount++;
      if (t >= weekStart) weekCount++;
      // 解析内容中的【维度】标签
      const content = e.content || "";
      DIMENSIONS.forEach(dim => {
        if (content.includes(`【${dim.keyword}】`)) {
          dimCountMap[dim.id]++;
        }
      });
    });

    // 最近7天每天数量
    const last7Days: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const d = new Date(dayStart);
      const count = entries.filter((e: any) => {
        const t = new Date(e.created_at).getTime();
        return t >= dayStart && t < dayEnd;
      }).length;
      last7Days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
    }

    // 维度饼图数据（只保留有数据的维度）
    const dimTotal = Object.values(dimCountMap).reduce((a, b) => a + b, 0);
    const dimPieData = DIMENSIONS.map((dim, i) => ({
      id: dim.id,
      label: dim.label,
      count: dimCountMap[dim.id],
      pct: dimTotal > 0 ? Math.round((dimCountMap[dim.id] / dimTotal) * 100) : 0,
      color: DIM_COLORS[i],
    })).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

    // 子标签词频统计
    // 意见内容格式：《维度》子标签1、子标签2 《维度》子标签3
    const tagCountMap: Record<string, number> = {};
    entries.forEach((e: any) => {
      const content = e.content || "";
      // 提取每个《维度》后面的内容，直到下一个《或结尾
      const segments = content.split(/【[^】]+】/);
      segments.forEach((seg: string) => {
        if (!seg.trim()) return;
        // 分隔符可能是、，空格
        const tags = seg.split(/[、，,\s]+/).map((t: string) => t.trim()).filter((t: string) => t.length > 0 && t.length <= 12);
        tags.forEach((tag: string) => {
          // 过滤掉过长的自由输入文本（超过12字算自由输入，不算标签）
          if (tag.length >= 2) {
            tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
          }
        });
      });
    });
    const tagCloud = Object.entries(tagCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    return { total, todayCount, weekCount, last7Days, dimPieData, dimTotal, tagCloud };
  }, [entries]);

  // ─── 分店筛选 ──────────────────────────────────────────────────────────────
  const selectedBranchName = selectedBranchId !== null
    ? branches.find((b: any) => b.id === selectedBranchId)?.name
    : null;

  const branchFilteredEntries = selectedBranchName
    ? entries.filter((e: any) => {
        if (!e.branch_name) return false;
        return e.branch_name === selectedBranchName ||
               e.branch_name.startsWith(selectedBranchName + '-') ||
               e.branch_name.startsWith(selectedBranchName + '·');
      })
    : entries;

  // ─── 关键词筛选 ────────────────────────────────────────────────────────────
  const filteredEntries = searchKeyword
    ? branchFilteredEntries.filter((e: any) =>
        e.content?.includes(searchKeyword) ||
        e.guest_name?.includes(searchKeyword) ||
        e.branch_name?.includes(searchKeyword)
      )
    : branchFilteredEntries;

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);
  const maxDay7Count = Math.max(...stats.last7Days.map(d => d.count), 1);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#FAF3ED" }}>

      {/* ══════════════════════════════════════════════════════════════
          红色区域：占 2/5 屏幕高度
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="flex-none overflow-hidden flex flex-col"
        style={{ height: "40vh", backgroundColor: "#D32F2F", color: "#FFFFFF" }}
      >
        {/* ── 顶部操作栏 ── */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-shrink-0">
          {/* 头像 */}
          <div className="flex-shrink-0">
            {user ? (
              <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="lg" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>?</div>
            )}
          </div>

          {/* 用户名 + 操作按钮 */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-base font-semibold truncate">{user?.nickname || user?.username || "用户"}</div>
                {isDemo && (
                  <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(255,220,0,0.25)", color: "#FFE082", border: "1px solid rgba(255,220,0,0.4)", letterSpacing: "0.02em" }}>
                    多身份体验
                  </span>
                )}
              </div>
              {ledgerData && (
                <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {(ledgerData as any).name}
                  {isDemo && sourceLedgerData && (
                    <span style={{ color: "rgba(255,220,0,0.8)" }}> · 数据来源：{(sourceLedgerData as any).name}（ID:{sourceLedgerId}）</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setShowSearch(true)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Search className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Settings className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={() => setLocation("/ledger")}
                className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-medium"
                style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#D32F2F", border: "1px solid rgba(255,255,255,0.4)", minWidth: "44px" }}
              >
                返回
              </button>
              <BranchDropdown branches={branches} selectedBranchId={selectedBranchId} onSelect={(id) => setSelectedBranchId(id)} />
            </div>
          </div>
        </div>

        {/* ── 数据概览面板 ── */}
        <div className="flex-1 px-4 pb-3 overflow-hidden flex flex-col gap-2">

          {/* 第一行：三个核心数字 */}
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

          {/* 第二行：维度饼图 + 7天趋势 */}
          <div className="flex-1 grid grid-cols-2 gap-2 overflow-hidden">

            {/* 左：问题维度横向排名条形图 */}
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
                            {isTop && <span style={{ marginRight: "2px", fontSize: "8px" }}>&#9650;</span>}
                            {seg.label}
                          </span>
                          <span style={{ color: isTop ? "#FFFFFF" : "rgba(255,255,255,0.85)", fontSize: "10px", fontWeight: isTop ? 700 : 600 }}>{seg.pct}%</span>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: isTop ? "5px" : "4px", backgroundColor: "rgba(255,255,255,0.15)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${barW}%`,
                              backgroundColor: isTop ? "#FFFFFF" : "rgba(255,255,255,0.6)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 右：近7天趋势 */}
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

       {/* ════════════════════════════════════════════════════════════
          意见列表区域：占 3/5 屏幕高度
      ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ height: "60vh" }}>

        {/* ── 多角色体验切换栏（仅 Demo 账本显示）── */}
        {isDemo && (
          <div className="flex-shrink-0 px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "#FFF8E1", borderBottom: "1px solid #FFE082" }}>
            <span className="text-[11px] font-semibold" style={{ color: "#795548", whiteSpace: "nowrap" }}>视角切换：</span>
            <div className="flex gap-1.5 flex-1">
              {DEMO_ROLES.map(role => (
                <button
                  key={role.id}
                  onClick={() => setDemoRole(role.id)}
                  className="flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all"
                  style={{
                    backgroundColor: demoRole === role.id ? role.color : "rgba(0,0,0,0.04)",
                    color: demoRole === role.id ? "#FFFFFF" : "#757575",
                    border: demoRole === role.id ? `2px solid ${role.color}` : "2px solid transparent",
                    boxShadow: demoRole === role.id ? `0 2px 8px ${role.color}40` : "none",
                  }}
                >
                  <span className="text-xs font-bold leading-none">{role.label}</span>
                  <span className="text-[10px] mt-0.5 leading-none" style={{ opacity: demoRole === role.id ? 0.85 : 0.6 }}>{role.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 客人视角：显示模拟 FeedbackPage ── */}
        {isDemo && demoRole === "guest" ? (
          <GuestViewSimulator ledgerName={(sourceLedgerData as any)?.name || (ledgerData as any)?.name || "意见本"} />
        ) : (
          <>
            {/* 统计条 */}
            <div className="px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0" style={{ backgroundColor: "#FAF3ED", borderBottom: "1px solid #EEE5DC" }}>
              <span className="text-gray-500">
                共 <span className="font-semibold" style={{ color: "#D32F2F" }}>{filteredEntries.length}</span> 条意见
                {selectedBranchId !== null && selectedBranch && (
                  <span className="ml-1" style={{ color: "#D32F2F" }}>· {selectedBranch.name}</span>
                )}
              </span>
              {isDemo && demoRole === "manager" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}>
                  店长视角·隐私信息已隐藏
                </span>
              )}
              {searchKeyword && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer"
                  style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}
                  onClick={() => setSearchKeyword("")}
                >
                  "{searchKeyword}" ×
                </span>
              )}
              <button onClick={() => refetch()} className="ml-auto" style={{ color: "#BDBDBD" }}>
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 意见时间轴 */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
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
                          <div
                            className="flex-shrink-0 w-3.5 h-3.5 rounded-full mt-2 z-10 border-2"
                            style={{ backgroundColor: entry.is_read ? "#E0E0E0" : "#D32F2F", borderColor: "#FAF3ED" }}
                          />
                          <div className="flex-1 rounded-xl p-3 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                            {/* 第一行：日期时间（左）+ 分店·桌号（右） */}
                            <div className="flex items-center justify-between mb-1.5 gap-2">
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {(() => {
                                  const d = new Date(entry.created_at);
                                  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                })()}
                              </span>
                              {entry.branch_name && entry.branch_name !== "未分类" && (() => {
                                const parts = entry.branch_name.split('-');
                                const storeName = parts[0];
                                const tableName = parts[1] || null;
                                return (
                                  <span className="text-xs flex items-center gap-1 flex-shrink-0">
                                    <span className="font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>{storeName}</span>
                                    {tableName && (
                                      <span className="font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}>{tableName}</span>
                                    )}
                                  </span>
                                );
                              })()}
                              {entry.rating && <StarRating rating={entry.rating} />}
                            </div>
                            <p className="text-sm text-gray-800 leading-relaxed">{entry.content}</p>
                            {(entry.guest_name || entry.guest_wechat) && (
                              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                                {entry.guest_name && (
                                  <span className="text-xs" style={{ color: "#9E9E9E" }}>称谓：{entry.guest_name}</span>
                                )}
                                {entry.guest_wechat && (
                                  <span className="text-xs" style={{ color: "#9E9E9E" }}>微信：{entry.guest_wechat}</span>
                                )}
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
          </>
        )}
      </div>

      {/* ── 弹窗 ── */}
      {showSearch && (
        <SearchDialog keyword={searchKeyword} onSearch={(kw) => setSearchKeyword(kw)} onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
