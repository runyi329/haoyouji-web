/**
 * OpinionBookDetail.tsx - AB 型定制账本（意见本）管理者查看页面
 * 布局参照 LedgerDetailAA，顶部红色区域：
 *   头像 + 用户名 | 搜索 + 设置 + 返回 + 分店下拉
 * 内容区：意见反馈列表，可按分店过滤
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Settings, Star, ChevronDown, MessageSquare, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
  selectedBranch,
  onSelect,
}: {
  branches: Array<{ branch_name: string | null; table_count: number }>;
  selectedBranch: string | null;
  onSelect: (branch: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    selectedBranch === null
      ? "全部分店"
      : selectedBranch || "未分组";

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all"
        style={{
          backgroundColor:
            selectedBranch !== null
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.2)",
          color: selectedBranch !== null ? "#D32F2F" : "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <span className="max-w-[80px] truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-lg overflow-hidden"
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E0E0E0",
              minWidth: "120px",
            }}
          >
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                selectedBranch === null
                  ? "bg-[#D32F2F] text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              全部分店
            </button>
            {branches.map((b) => (
              <button
                key={b.branch_name ?? "__null__"}
                onClick={() => { onSelect(b.branch_name ?? ""); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                  selectedBranch === (b.branch_name ?? "")
                    ? "bg-[#D32F2F] text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {b.branch_name || "未分组"}
                <span
                  className={`ml-1 text-xs ${
                    selectedBranch === (b.branch_name ?? "")
                      ? "text-red-200"
                      : "text-gray-400"
                  }`}
                >
                  ({b.table_count})
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 搜索弹窗 ─────────────────────────────────────────────────────────────────
function SearchDialog({
  onClose,
  onSearch,
  keyword,
}: {
  onClose: () => void;
  onSearch: (kw: string) => void;
  keyword: string;
}) {
  const [input, setInput] = useState(keyword);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ backgroundColor: "#FFFFFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">搜索意见内容</p>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSearch(input); onClose(); }
            }}
            placeholder="输入关键词..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D32F2F]"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm text-gray-500 border border-gray-200"
            >
              取消
            </button>
            <button
              onClick={() => { onSearch(input); onClose(); }}
              className="flex-1 py-2 rounded-xl text-sm text-white font-medium"
              style={{ backgroundColor: "#D32F2F" }}
            >
              搜索
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 设置弹窗（占位，可扩展） ─────────────────────────────────────────────────
function SettingsDialog({
  book,
  onClose,
}: {
  book: any;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-hidden shadow-xl pb-8"
        style={{ backgroundColor: "#FFFFFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          <p className="text-base font-bold text-gray-800 mb-1">{book?.name || "意见本"}</p>
          {book?.store_name && (
            <p className="text-sm text-gray-400 mb-4">{book.store_name}</p>
          )}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">意见本名称</span>
              <span className="text-sm text-gray-800 font-medium">{book?.name}</span>
            </div>
            {book?.store_name && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">品牌名称</span>
                <span className="text-sm text-gray-800 font-medium">{book.store_name}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">创建时间</span>
              <span className="text-sm text-gray-800">
                {book?.created_at
                  ? new Date(book.created_at).toLocaleDateString("zh-CN")
                  : "—"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-5 w-full py-3 rounded-xl text-sm text-gray-500 border border-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function OpinionBookDetail() {
  const params = useParams<{ bookId: string }>();
  const bookId = parseInt(params.bookId || "0");
  const [, setLocation] = useLocation();

  // 分店过滤
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  // 搜索关键词
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // 分页
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // 当前用户
  const { data: user } = trpc.auth.me.useQuery();

  // 意见本信息（从列表接口获取）
  const { data: books } = trpc.opinionBook.list.useQuery();
  const book = books?.find((b: any) => b.id === bookId);

  // 分店列表
  const { data: branches } = trpc.opinionBook.getBranches.useQuery(
    { bookId },
    { enabled: bookId > 0 }
  );

  // 意见列表
  const {
    data: entriesData,
    isLoading,
    refetch,
  } = trpc.opinionBook.getEntries.useQuery(
    {
      bookId,
      branchName: selectedBranch !== null ? selectedBranch : undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: bookId > 0 }
  );

  const entries = entriesData?.entries || [];
  const total = entriesData?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 关键词过滤（前端过滤）
  const filteredEntries = searchKeyword
    ? entries.filter(
        (e: any) =>
          e.content?.includes(searchKeyword) ||
          e.guest_name?.includes(searchKeyword) ||
          e.table_code?.includes(searchKeyword)
      )
    : entries;

  const hasBranches = branches && branches.length > 0;

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
              {book && (
                <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {book.store_name || book.name}
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
                onClick={() => {
                  if (book?.ledger_id) {
                    setLocation(`/ledger/${book.ledger_id}/settings`);
                  } else {
                    setShowSettings(true);
                  }
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Settings className="w-3.5 h-3.5 text-white" />
              </button>

              {/* 返回按钮 */}
              <button
                onClick={() => setLocation("/admin")}
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
                branches={branches ?? []}
                selectedBranch={selectedBranch}
                onSelect={(b) => { setSelectedBranch(b); setPage(1); }}
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
          {selectedBranch !== null && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#FFFFFF" }}
            >
              {selectedBranch || "未分组"}
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
          <div className="p-4 space-y-3">
            {filteredEntries.map((entry: any) => (
              <div
                key={entry.id}
                className="rounded-2xl p-4 shadow-sm"
                style={{ backgroundColor: "#FFFFFF" }}
              >
                {/* 头部：桌号 + 分店 + 时间 */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}
                    >
                      {entry.branch_name ? `${entry.branch_name} · ` : ""}
                      {entry.table_code}
                    </span>
                    {entry.location && (
                      <span className="text-xs text-gray-400">{entry.location}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {new Date(entry.created_at).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* 星级 */}
                {entry.rating && (
                  <div className="mb-2">
                    <StarRating rating={entry.rating} />
                  </div>
                )}

                {/* 意见内容 */}
                <p className="text-sm text-gray-800 leading-relaxed">{entry.content}</p>

                {/* 底部：访客名 */}
                {entry.guest_name && (
                  <p className="text-xs text-gray-400 mt-2">— {entry.guest_name}</p>
                )}
              </div>
            ))}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2 pb-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm text-gray-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 弹窗 ── */}
      {showSearch && (
        <SearchDialog
          keyword={searchKeyword}
          onSearch={(kw) => { setSearchKeyword(kw); setPage(1); }}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showSettings && (
        <SettingsDialog book={book} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
