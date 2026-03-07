/**
 * OpinionBookDetail.tsx - AB 型定制账本（意见本）管理者查看页面
 * 数据架构已统一：
 *   - 分店 → ledger_categories (type='branch')
 *   - 意见记录 → ledger_records（复用 ledger.getTransactions 通用接口）
 * 布局：顶部红色区域（头像+用户名+搜索+设置+返回+分店下拉）+ 意见列表
 */
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Settings, Star, ChevronDown, MessageSquare, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

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
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all"
        style={{
          backgroundColor:
            selectedBranchId !== null
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.15)",
          color: selectedBranchId !== null ? "#D32F2F" : "#FFFFFF",
          border:
            selectedBranchId !== null
              ? "1px solid rgba(255,255,255,0.4)"
              : "1px solid rgba(255,255,255,0.2)",
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
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                selectedBranchId === null
                  ? "font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              style={selectedBranchId === null ? { color: "#D32F2F", backgroundColor: "#FFF5F5" } : {}}
            >
              全部分店
            </button>
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => { onSelect(b.id); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  selectedBranchId === b.id
                    ? "font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
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
function SearchDialog({
  keyword,
  onSearch,
  onClose,
}: {
  keyword: string;
  onSearch: (kw: string) => void;
  onClose: () => void;
}) {
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
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => { onSearch(value); onClose(); }}
            className="px-4 py-1.5 text-sm text-white rounded-lg"
            style={{ backgroundColor: "#D32F2F" }}
          >
            搜索
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function OpinionBookDetail() {
  // 路由参数：bookId 实际上是 ledgerId（两者统一后相同）
  const params = useParams<{ bookId: string }>();
  const ledgerId = parseInt(params.bookId || "0");
  const [, setLocation] = useLocation();

  // 分店过滤（存储 ledger_categories.id）
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  // 搜索关键词
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // 当前用户
  const { data: user } = trpc.auth.me.useQuery();

  // 账本信息（直接用通用接口获取账本详情）
  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 分店列表（复用通用分类接口，一级分类 = 分店）
  const { data: allCategories = [] } = trpc.ledger.getCategories.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );
  // 只取一级分类（parentId === null）且非默认分类作为分店
  const branches = (allCategories as any[]).filter(
    (c: any) => c.parentId === null && !c.isDefault
  ).map((c: any) => ({ id: c.id, name: c.name }));

  // ★ 核心改动：复用通用账本的 getTransactions 接口，与通用账本一样秒出
  // 注意：不传 categoryId 给后端，因为分店筛选需要包含该分店下所有桌号的记录，改用前端按 branch_name 筛选
  const {
    data: transactionsData,
    isLoading,
    refetch,
  } = trpc.ledger.getTransactions.useQuery(
    {
      ledgerId,
      limit: 500,
    },
    { enabled: ledgerId > 0 }
  );

  // 将通用账本的按日期分组数据，展平为意见列表
  const { entries, total } = useMemo(() => {
    if (!transactionsData || !Array.isArray(transactionsData)) {
      return { entries: [], total: 0 };
    }
    const allEntries: any[] = [];
    transactionsData.forEach((day: any) => {
      if (day.records) {
        day.records.forEach((record: any) => {
          allEntries.push({
            id: record.id,
            content: record.description || "",
            created_at: record.createdAt,
            branch_name: record.category !== "未分类" ? record.category : null,
            // 通用接口不返回 rating/guest_name/guest_wechat/is_read
            // 这些字段在意见本中暂时不使用，后续可以通过扩展通用接口来支持
            rating: null,
            guest_name: null,
            guest_wechat: null,
            is_read: false,
          });
        });
      }
    });
    return { entries: allEntries, total: allEntries.length };
  }, [transactionsData]);

  // 分店过滤（前端过滤）
  // branch_name 格式是 "分店名-桌号" 或 "分店名"，用 startsWith 匹配
  const selectedBranchName = selectedBranchId !== null
    ? branches.find((b: any) => b.id === selectedBranchId)?.name
    : null;

  const branchFilteredEntries = selectedBranchName
    ? entries.filter((e: any) => {
        if (!e.branch_name) return false;
        // branch_name 可能是 "分店名-桌号" 或直接是 "分店名"
        return e.branch_name === selectedBranchName ||
               e.branch_name.startsWith(selectedBranchName + '-') ||
               e.branch_name.startsWith(selectedBranchName + '·');
      })
    : entries;

  // 关键词过滤（前端过滤）
  const filteredEntries = searchKeyword
    ? branchFilteredEntries.filter(
        (e: any) =>
          e.content?.includes(searchKeyword) ||
          e.guest_name?.includes(searchKeyword) ||
          e.branch_name?.includes(searchKeyword)
      )
    : branchFilteredEntries;

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#FAF3ED" }}>
      {/* ── 顶部红色区域 ── */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          {/* 头像 */}
          <div className="flex-shrink-0">
            {user ? (
              <UserAvatar
                username={user.username}
                avatar={user.avatar}
                nickname={user.nickname}
                size="lg"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
              >
                ?
              </div>
            )}
          </div>

          {/* 用户名 + 操作按钮 */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">
                {user?.nickname || user?.username || "用户"}
              </div>
              {ledgerData && (
                <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {(ledgerData as any).name}
                </div>
              )}
            </div>

            {/* 右侧：搜索 + 设置 + 返回 + 分店下拉 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 搜索按钮 */}
              <button
                onClick={() => setShowSearch(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Search className="w-3.5 h-3.5 text-white" />
              </button>

              {/* 设置按钮 */}
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Settings className="w-3.5 h-3.5 text-white" />
              </button>

              {/* 返回按钮 */}
              <button
                onClick={() => setLocation("/ledger")}
                className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                  minWidth: "44px",
                }}
              >
                返回
              </button>

              {/* 分店下拉（始终显示） */}
              <BranchDropdown
                branches={branches}
                selectedBranchId={selectedBranchId}
                onSelect={(id) => { setSelectedBranchId(id); }}
              />
            </div>
          </div>
        </div>

        {/* 统计条 */}
        <div
          className="px-4 pb-3 flex items-center gap-3 text-xs"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          <span>
            共{" "}
            <span className="text-white font-semibold">{total}</span> 条意见
          </span>
          {selectedBranchId !== null && selectedBranch && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#FFFFFF" }}
            >
              {selectedBranch.name}
            </span>
          )}
          {searchKeyword && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#FFFFFF" }}
              onClick={() => setSearchKeyword("")}
            >
              "{searchKeyword}" ×
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="ml-auto"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mb-2" />
            <p className="text-sm">加载中...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">
              {searchKeyword ? "没有匹配的意见" : "暂无意见"}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-3 pb-4">
            {/* 流水账时间轴 */}
            <div className="relative">
              {/* 左侧竖线 */}
              <div
                className="absolute left-[7px] top-0 bottom-0 w-0.5"
                style={{ backgroundColor: "#E0E0E0" }}
              />
              <div className="space-y-0">
                {filteredEntries.map((entry: any) => (
                  <div key={entry.id} className="relative flex gap-3 pb-3">
                    {/* 时间轴圆点 */}
                    <div
                      className="flex-shrink-0 w-3.5 h-3.5 rounded-full mt-2 z-10 border-2"
                      style={{
                        backgroundColor: entry.is_read ? "#E0E0E0" : "#D32F2F",
                        borderColor: "#FAF3ED",
                      }}
                    />
                    {/* 卡片内容 */}
                    <div
                      className="flex-1 rounded-xl p-3 shadow-sm"
                      style={{ backgroundColor: "#FFFFFF" }}
                    >
                      {/* 第一行：日期时间（左）+ 分店·桌号（右） */}
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        {/* 左：日期时间 */}
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {(() => {
                            const d = new Date(entry.created_at);
                            return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                          })()}
                        </span>
                        {/* 右：分店·桌号 */}
                        {entry.branch_name && entry.branch_name !== "未分类" && (() => {
                          // category 格式为 "分店-桌号" 或 "分店"
                          const parts = entry.branch_name.split('-');
                          const storeName = parts[0];
                          const tableName = parts[1] || null;
                          return (
                            <span className="text-xs flex items-center gap-1 flex-shrink-0">
                              <span
                                className="font-medium px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}
                              >
                                {storeName}
                              </span>
                              {tableName && (
                                <span
                                  className="font-medium px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}
                                >
                                  {tableName}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                        {entry.rating && <StarRating rating={entry.rating} />}
                      </div>

                      {/* 意见内容 */}
                      <p className="text-sm text-gray-800 leading-relaxed">{entry.content}</p>

                      {/* 底部：访客称谓 + 微信号 */}
                      {(entry.guest_name || entry.guest_wechat) && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                          {entry.guest_name && (
                            <span className="text-xs text-gray-400">
                              👤 {entry.guest_name}
                            </span>
                          )}
                          {entry.guest_wechat && (
                            <span className="text-xs text-gray-400">
                              💬 {entry.guest_wechat}
                            </span>
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

      {/* ── 弹窗 ── */}
      {showSearch && (
        <SearchDialog
          keyword={searchKeyword}
          onSearch={(kw) => { setSearchKeyword(kw); }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
