/**
 * OpinionBookDemo.tsx - AB 账本多角色体验版
 * 路由：/opinion-demo/:bookId
 * 顶部三身份切换栏：老板 / 店长 / 客人
 * 切换后展示对应角色的视角与权限差异
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { RefreshCw, MessageSquare, Star, Eye, EyeOff, Users, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// ─── 角色定义 ─────────────────────────────────────────────────────────────────
type Role = "owner" | "manager" | "guest";

const ROLES: { id: Role; label: string; subtitle: string; color: string; bg: string; border: string; desc: string }[] = [
  {
    id: "owner",
    label: "老板视角",
    subtitle: "完整权限",
    color: "#B71C1C",
    bg: "#B71C1C",
    border: "#B71C1C",
    desc: "可查看所有意见、客人称谓与微信、数据统计分析",
  },
  {
    id: "manager",
    label: "店长视角",
    subtitle: "管理权限",
    color: "#E65100",
    bg: "#E65100",
    border: "#E65100",
    desc: "可查看意见内容与统计，但无法看到客人隐私信息",
  },
  {
    id: "guest",
    label: "客人视角",
    subtitle: "提交反馈",
    color: "#1565C0",
    bg: "#1565C0",
    border: "#1565C0",
    desc: "扫码后看到的提交页面，填写意见并享受95折优惠",
  },
];

// ─── 六大维度 ─────────────────────────────────────────────────────────────────
const DIMENSIONS = [
  { id: "food",       label: "菜品质量", keyword: "菜品质量" },
  { id: "service",    label: "服务表现", keyword: "服务表现" },
  { id: "env",        label: "环境氛围", keyword: "环境氛围" },
  { id: "hygiene",    label: "卫生安全", keyword: "卫生安全" },
  { id: "efficiency", label: "运营效率", keyword: "运营效率" },
  { id: "value",      label: "价值感",   keyword: "价值感" },
];

// ─── 词云组件 ─────────────────────────────────────────────────────────────────
function WordCloud({ tags }: { tags: Array<{ tag: string; count: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Array<{ tag: string; x: number; y: number; fontSize: number; opacity: number }>>([]);

  useEffect(() => {
    if (!containerRef.current || tags.length === 0) { setPlaced([]); return; }
    const W = containerRef.current.offsetWidth;
    const H = containerRef.current.offsetHeight;
    if (W === 0 || H === 0) return;
    const maxCount = tags[0].count;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const result: typeof placed = [];
    tags.forEach(({ tag, count }) => {
      const ratio = count / maxCount;
      const fontSize = Math.round(10 + ratio * 10);
      const opacity = 0.5 + ratio * 0.5;
      const tw = tag.length * fontSize * 0.95;
      const th = fontSize * 1.4;
      let placed_ok = false;
      const step = 2;
      const maxR = Math.min(W, H) * 0.52;
      for (let r = 0; r <= maxR && !placed_ok; r += step) {
        const angleCount = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r / (fontSize * 1.2)));
        const angleOffset = (count * 137.5 * Math.PI) / 180;
        for (let ai = 0; ai < angleCount && !placed_ok; ai++) {
          const angle = angleOffset + (ai / angleCount) * 2 * Math.PI;
          const cx = W / 2 + r * Math.cos(angle);
          const cy = H / 2 + r * Math.sin(angle);
          const x = cx - tw / 2;
          const y = cy - th / 2;
          if (x < 2 || y < 2 || x + tw > W - 2 || y + th > H - 2) continue;
          const overlap = rects.some(rect =>
            x < rect.x + rect.w + 3 && x + tw > rect.x - 3 &&
            y < rect.y + rect.h + 3 && y + th > rect.y - 3
          );
          if (!overlap) {
            rects.push({ x, y, w: tw, h: th });
            result.push({ tag, x, y, fontSize, opacity });
            placed_ok = true;
          }
        }
      }
    });
    setPlaced(result);
  }, [tags]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 140 }}>
      {placed.map(({ tag, x, y, fontSize, opacity }) => (
        <span
          key={tag}
          style={{
            position: "absolute", left: x, top: y,
            fontSize, opacity, color: "#D32F2F",
            fontWeight: opacity >= 0.9 ? 700 : opacity >= 0.7 ? 600 : 400,
            whiteSpace: "nowrap", lineHeight: 1.4,
          }}
        >{tag}</span>
      ))}
    </div>
  );
}

// ─── 星级组件 ─────────────────────────────────────────────────────────────────
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className="w-3 h-3" fill={i <= rating ? "#FFC107" : "none"} stroke={i <= rating ? "#FFC107" : "#D1D5DB"} />
      ))}
    </div>
  );
}

// ─── 客人视角模拟组件 ─────────────────────────────────────────────────────────
function GuestView({ ledgerId, branches }: { ledgerId: number; branches: any[] }) {
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [step, setStep] = useState(1);

  return (
    <div className="flex flex-col" style={{ minHeight: 400 }}>
      {/* 模拟顶部红色区 */}
      <div className="rounded-xl overflow-hidden mb-3" style={{ backgroundColor: "#D32F2F" }}>
        <div className="px-4 py-3 relative">
          <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/10 rounded-full" />
          <p className="text-white/70 text-xs mb-0.5">意见本 · {selectedBranch ? selectedBranch.name : "请选择分店"}</p>
          <h2 className="text-white text-base font-bold">欢迎提意见</h2>
          <p className="text-white/70 text-xs mt-0.5">提交后享 <span className="text-yellow-300 font-semibold">95折</span> 优惠</p>
        </div>
      </div>

      {/* 分店选择 */}
      {branches.length > 0 && (
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
          <p className="text-xs text-gray-500 mb-2 font-medium">选择分店</p>
          <div className="flex flex-wrap gap-2">
            {branches.map((b: any) => (
              <button
                key={b.id}
                onClick={() => setSelectedBranch(b)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                style={selectedBranch?.id === b.id
                  ? { backgroundColor: "#FFEBEE", borderColor: "#D32F2F", color: "#D32F2F" }
                  : { backgroundColor: "#F5F5F5", borderColor: "#E0E0E0", color: "#666" }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 步骤说明 */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4" style={{ color: "#D32F2F" }} />
          <span className="text-sm font-semibold text-gray-800">填写意见（提交后享95折）</span>
        </div>
        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={step >= s
                  ? { backgroundColor: "#D32F2F", color: "#fff" }
                  : { backgroundColor: "#F5F5F5", color: "#9E9E9E" }}
              >{s}</div>
              <span className="text-xs" style={{ color: step >= s ? "#D32F2F" : "#9E9E9E" }}>
                {s === 1 ? "选维度" : s === 2 ? "选标签" : "写建议"}
              </span>
              {s < 3 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DIMENSIONS.map(dim => (
            <div
              key={dim.id}
              onClick={() => setStep(2)}
              className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center border-2 cursor-pointer"
              style={{ backgroundColor: "#F9F9F9", borderColor: "#E0E0E0" }}
            >
              <span className="text-xs font-semibold text-gray-700">{dim.label}</span>
            </div>
          ))}
        </div>
        {step >= 2 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-xs text-gray-500 mb-2">选择具体问题（可多选）</p>
            <div className="flex flex-wrap gap-1.5">
              {["太咸", "太油腻", "食材不新鲜", "分量不足", "响应太慢", "态度不好"].map(tag => (
                <span key={tag} className="px-2 py-1 rounded-full text-xs border" style={{ backgroundColor: "#F5F5F5", borderColor: "#E0E0E0", color: "#666" }}>{tag}</span>
              ))}
            </div>
          </div>
        )}
        {step >= 3 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-xs text-gray-500 mb-2">如果今天只能改进一点，你希望是什么？</p>
            <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400 bg-gray-50">在此输入...</div>
          </div>
        )}
        <button
          onClick={() => setStep(s => Math.min(s + 1, 3))}
          className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: "#D32F2F" }}
        >
          {step < 3 ? "下一步" : "提交意见"}
        </button>
      </div>

      {/* 支付区 */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        <p className="text-xs font-semibold text-gray-700 mb-2">消费金额（享95折优惠）</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400 bg-gray-50">输入本次消费金额...</div>
          <button className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "#1677FF" }}>支付宝付款</button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">提交意见后自动享受95折，无需优惠码</p>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function OpinionBookDemo() {
  const params = useParams<{ bookId: string }>();
  const ledgerId = parseInt(params.bookId || "0");
  const [, setLocation] = useLocation();
  const [activeRole, setActiveRole] = useState<Role>("owner");
  const [isInitializing, setIsInitializing] = useState(false);
  const [demoLedgerId, setDemoLedgerId] = useState<number | null>(null);

  // 初始化：复制账本为 Demo 版
  const cloneMutation = trpc.opinionBook.cloneAsDemo.useMutation({
    onSuccess: (data) => {
      setDemoLedgerId(data.demoLedgerId);
      if (data.created) {
        toast.success("多角色体验版已创建");
      }
      setIsInitializing(false);
    },
    onError: (err) => {
      toast.error(`初始化失败：${err.message}`);
      setIsInitializing(false);
    },
  });

  // 自动初始化
  useEffect(() => {
    if (ledgerId > 0 && !demoLedgerId) {
      setIsInitializing(true);
      cloneMutation.mutate({ ledgerId });
    }
  }, [ledgerId]);

  // 获取 Demo 视角数据
  const targetLedgerId = demoLedgerId || ledgerId;
  const { data: viewData, isLoading: viewLoading } = trpc.opinionBook.getDemoView.useQuery(
    { ledgerId: targetLedgerId, role: activeRole === "guest" ? "owner" : activeRole, pageSize: 200 },
    { enabled: targetLedgerId > 0 && activeRole !== "guest" }
  );

  // 客人视角：获取公开分类信息
  const { data: guestData } = trpc.opinionBook.getDemoView.useQuery(
    { ledgerId: targetLedgerId, role: "guest", pageSize: 1 },
    { enabled: targetLedgerId > 0 && activeRole === "guest" }
  );

  const entries = useMemo(() => {
    if (!viewData || !Array.isArray(viewData.entries)) return [];
    return viewData.entries;
  }, [viewData]);

  // 统计数据
  const stats = useMemo(() => {
    const total = entries.length;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    let todayCount = 0, weekCount = 0;
    const dimCountMap: Record<string, number> = {};
    DIMENSIONS.forEach(d => { dimCountMap[d.id] = 0; });
    const tagCountMap: Record<string, number> = {};
    entries.forEach((e: any) => {
      const t = new Date(e.created_at).getTime();
      if (t >= todayStart) todayCount++;
      if (t >= weekStart) weekCount++;
      const content = e.content || "";
      DIMENSIONS.forEach(dim => {
        if (content.includes(`【${dim.keyword}】`)) dimCountMap[dim.id]++;
      });
      const tagMatches = content.match(/】([^【]+)/g) || [];
      tagMatches.forEach((m: string) => {
        const raw = m.replace(/^】/, "").trim();
        raw.split(/[、,，\s]+/).forEach((tag: string) => {
          if (tag.length >= 2 && tag.length <= 8) {
            tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
          }
        });
      });
    });
    const dimRanking = DIMENSIONS.map(d => ({ label: d.label, count: dimCountMap[d.id] }))
      .sort((a, b) => b.count - a.count);
    const hotTags = Object.entries(tagCountMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return { total, todayCount, weekCount, dimRanking, hotTags };
  }, [entries]);

  const currentRole = ROLES.find(r => r.id === activeRole)!;

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF3ED" }}>
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#D32F2F" }} />
          <p className="text-sm text-gray-500">正在初始化体验版数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF3ED" }}>

      {/* ── 顶部标题栏 ── */}
      <div style={{ backgroundColor: "#D32F2F" }} className="px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation(-1 as any)} className="text-white/70 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base leading-tight">
              {viewData?.ledger?.name || "多角色体验版"}
            </h1>
            <p className="text-white/60 text-xs mt-0.5">切换身份，体验不同角色的视角与权限</p>
          </div>
          <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-1">
            <Users className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-medium">Demo</span>
          </div>
        </div>

        {/* ── 三身份切换栏 ── */}
        <div className="flex gap-0 rounded-t-2xl overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setActiveRole(role.id)}
              className="flex-1 py-3 px-2 flex flex-col items-center gap-0.5 transition-all"
              style={activeRole === role.id
                ? { backgroundColor: "#FAF3ED" }
                : { backgroundColor: "transparent" }}
            >
              <span
                className="text-sm font-bold leading-tight"
                style={{ color: activeRole === role.id ? role.color : "rgba(255,255,255,0.75)" }}
              >
                {role.label}
              </span>
              <span
                className="text-xs leading-tight"
                style={{ color: activeRole === role.id ? "#9E9E9E" : "rgba(255,255,255,0.5)" }}
              >
                {role.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 角色说明条 ── */}
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#FFF8F5", borderBottom: "1px solid #F0E0D6" }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentRole.color }} />
        <p className="text-xs text-gray-600 flex-1">{currentRole.desc}</p>
        {activeRole === "owner" && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#B71C1C" }}>
            <Eye className="w-3 h-3" />
            <span>隐私可见</span>
          </div>
        )}
        {activeRole === "manager" && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#E65100" }}>
            <EyeOff className="w-3 h-3" />
            <span>隐私隐藏</span>
          </div>
        )}
      </div>

      {/* ── 内容区 ── */}
      <div className="px-4 pt-3 pb-6">

        {/* 客人视角 */}
        {activeRole === "guest" && (
          <GuestView
            ledgerId={targetLedgerId}
            branches={guestData?.branches || []}
          />
        )}

        {/* 老板/店长视角 */}
        {activeRole !== "guest" && (
          <>
            {/* 数据概览 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "总意见数", value: stats.total },
                { label: "本周新增", value: stats.weekCount },
                { label: "今日新增", value: stats.todayCount },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
                  <p className="text-xl font-bold" style={{ color: "#D32F2F" }}>{item.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            {/* 建议排行 */}
            <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
              <p className="text-xs font-semibold text-gray-600 mb-2">建议排行（六大维度）</p>
              <div className="space-y-1.5">
                {stats.dimRanking.map((d, i) => {
                  const maxCount = stats.dimRanking[0]?.count || 1;
                  const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div key={d.label} className="flex items-center gap-2">
                      <span className="text-xs w-14 text-right text-gray-500 flex-shrink-0">{d.label}</span>
                      <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: "#F5F5F5" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: i === 0 ? "#D32F2F" : i === 1 ? "#E57373" : i === 2 ? "#EF9A9A" : "#FFCDD2",
                          }}
                        />
                      </div>
                      <span className="text-xs w-6 text-right text-gray-400 flex-shrink-0">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 热词云 */}
            {stats.hotTags.length > 0 && (
              <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
                <p className="text-xs font-semibold text-gray-600 mb-2">热词</p>
                <WordCloud tags={stats.hotTags} />
              </div>
            )}

            {/* 权限对比说明 */}
            {activeRole === "manager" && (
              <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#FFF3E0", borderColor: "#FFE0B2" }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#E65100" }}>店长视角权限说明</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-500">✓</span> 可查看所有意见内容
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-500">✓</span> 可查看数据统计与分析
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: "#E65100" }}>
                    <span>✗</span> 无法查看客人称谓和微信号（隐私保护）
                  </div>
                </div>
              </div>
            )}

            {activeRole === "owner" && (
              <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#FFEBEE", borderColor: "#FFCDD2" }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#B71C1C" }}>老板视角权限说明</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-500">✓</span> 可查看所有意见内容
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-500">✓</span> 可查看数据统计与分析
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-500">✓</span> 可查看客人称谓和微信号（完整隐私）
                  </div>
                </div>
              </div>
            )}

            {/* 意见列表 */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-50 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">意见记录</p>
                <span className="text-xs text-gray-400">共 {entries.length} 条</span>
              </div>
              {viewLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">加载中...</span>
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">暂无意见记录</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {entries.slice(0, 30).map((entry: any) => (
                    <div key={entry.id} className="px-3 py-2.5">
                      {/* 时间 + 分店 */}
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-xs text-gray-400">
                          {(() => {
                            const d = new Date(entry.created_at);
                            return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                          })()}
                        </span>
                        <div className="flex items-center gap-1">
                          {entry.branch_name && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>
                              {entry.branch_name}
                            </span>
                          )}
                          {entry.rating && <StarRating rating={entry.rating} />}
                        </div>
                      </div>
                      {/* 内容 */}
                      <p className="text-sm text-gray-800 leading-relaxed">{entry.content}</p>
                      {/* 隐私信息（仅老板可见） */}
                      {(entry.guest_name || entry.guest_wechat) && (
                        <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-gray-50">
                          {entry.guest_name && (
                            <span className="text-xs" style={{ color: "#9E9E9E" }}>称谓：{entry.guest_name}</span>
                          )}
                          {entry.guest_wechat && (
                            <span className="text-xs" style={{ color: "#9E9E9E" }}>微信：{entry.guest_wechat}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {entries.length > 30 && (
                    <div className="px-3 py-2 text-center text-xs text-gray-400">
                      仅展示最新 30 条，共 {entries.length} 条
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
