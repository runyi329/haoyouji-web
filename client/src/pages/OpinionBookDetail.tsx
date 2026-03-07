/**
 * OpinionBookDetail.tsx - AB 型定制账本（意见本）管理者查看页面
 * 布局：红色区域 2/5（头像+操作栏+数据概览）+ 意见列表 3/5
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Settings, Star, ChevronDown, MessageSquare, RefreshCw } from "lucide-react";

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

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function OpinionBookDetail() {
  const params = useParams<{ bookId: string }>();
  const ledgerId = parseInt(params.bookId || "0");
  const [, setLocation] = useLocation();

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId }, { enabled: ledgerId > 0 });
  const { data: allCategories = [] } = trpc.ledger.getCategories.useQuery({ ledgerId }, { enabled: ledgerId > 0 });

  const branches = (allCategories as any[])
    .filter((c: any) => c.parentId === null && !c.isDefault)
    .map((c: any) => ({ id: c.id, name: c.name }));

  const { data: transactionsData, isLoading, refetch } = trpc.ledger.getTransactions.useQuery(
    { ledgerId, limit: 500 },
    { enabled: ledgerId > 0 }
  );

  // 展平所有意见记录
  const entries = useMemo(() => {
    if (!transactionsData || !Array.isArray(transactionsData)) return [];
    const all: any[] = [];
    transactionsData.forEach((day: any) => {
      if (day.records) {
        day.records.forEach((record: any) => {
          all.push({
            id: record.id,
            content: record.description || "",
            created_at: record.createdAt,
            branch_name: record.category !== "未分类" ? record.category : null,
            rating: null,
            guest_name: null,
            guest_wechat: null,
            is_read: false,
          });
        });
      }
    });
    return all;
  }, [transactionsData]);

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
              <div className="text-base font-semibold truncate">{user?.nickname || user?.username || "用户"}</div>
              {ledgerData && (
                <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.75)" }}>{(ledgerData as any).name}</div>
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

      {/* ══════════════════════════════════════════════════════════════
          意见列表区域：占 3/5 屏幕高度
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ height: "60vh" }}>
        {/* 统计条 */}
        <div className="px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0" style={{ backgroundColor: "#FAF3ED", borderBottom: "1px solid #EEE5DC" }}>
          <span className="text-gray-500">
            共 <span className="font-semibold" style={{ color: "#D32F2F" }}>{filteredEntries.length}</span> 条意见
            {selectedBranchId !== null && selectedBranch && (
              <span className="ml-1" style={{ color: "#D32F2F" }}>· {selectedBranch.name}</span>
            )}
          </span>
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
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                            {entry.guest_name && <span className="text-xs text-gray-400">👤 {entry.guest_name}</span>}
                            {entry.guest_wechat && <span className="text-xs text-gray-400">💬 {entry.guest_wechat}</span>}
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

      {/* ── 弹窗 ── */}
      {showSearch && (
        <SearchDialog keyword={searchKeyword} onSearch={(kw) => setSearchKeyword(kw)} onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
