/**
 * LedgerDetailAG.tsx - AG型定制账本：共享图片助记词（只读浏览模式）
 *
 * 功能：
 *   - 分页加载（每次20条，滚动到底自动加载更多）
 *   - 顶部标签筛选栏（横向滚动）
 *   - 搜索框（关键词搜索标题/提示词）
 *   - 点击图片弹出白色底部抽屉（仿OpenNana详情页）
 *
 * 权限：所有成员只读浏览，内容由管理员批量导入
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Settings,
  Copy,
  Check,
  ImageIcon,
  Users,
  X,
  Search,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

interface Props {
  ledgerId: number;
  ledgerData: any;
  membersData: any[];
  user: any;
}

interface PromptImage {
  id: number;
  ledgerId: number;
  imageUrl: string;
  imageKey: string;
  promptText: string | null;
  title: string | null;
  tags: string | null;
  author: string | null;
  uploadedBy: number;
  createdAt: string;
}

/** 解析 prompt_text 中的中英文内容 */
function parsePrompt(text: string | null): { zh: string; en: string } {
  if (!text) return { zh: "", en: "" };
  const zhMatch = text.match(/【中文提示词】\n([\s\S]*?)(?=\n\n【English Prompt】|$)/);
  const enMatch = text.match(/【English Prompt】\n([\s\S]*?)$/);
  return {
    zh: zhMatch ? zhMatch[1].trim() : "",
    en: enMatch ? enMatch[1].trim() : text.trim(),
  };
}

/** 解析 tags JSON 数组 */
function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const arr = JSON.parse(tagsJson);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 从标题提取主标题（去掉 # 标签部分） */
function getShortTitle(title: string | null): string {
  if (!title) return "";
  const hashIdx = title.indexOf("  #");
  return hashIdx > 0 ? title.slice(0, hashIdx) : title;
}

export default function LedgerDetailAG({ ledgerId, ledgerData, membersData, user }: Props) {
  const [, setLocation] = useLocation();
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PromptImage | null>(null);
  const [copiedZh, setCopiedZh] = useState(false);
  const [copiedEn, setCopiedEn] = useState(false);
  const [copiedCard, setCopiedCard] = useState<number | null>(null);

  // 筛选状态
  const [activeTag, setActiveTag] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");

  // 分页状态
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<PromptImage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const loaderRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // 当筛选条件变化时重置分页
  useEffect(() => {
    setPage(1);
    setAllItems([]);
    setHasMore(true);
  }, [activeTag, keyword]);

  // 获取图片列表
  const { data, isLoading, isFetching } = trpc.ledger.getAgPromptImages.useQuery(
    {
      ledgerId,
      page,
      pageSize: PAGE_SIZE,
      tag: activeTag || undefined,
      keyword: keyword || undefined,
    },
    { keepPreviousData: true }
  );

  // 合并分页数据
  useEffect(() => {
    if (!data) return;
    if (page === 1) {
      setAllItems(data.items as PromptImage[]);
    } else {
      setAllItems(prev => [...prev, ...(data.items as PromptImage[])]);
    }
    setHasMore(data.hasMore);
    setTotal(data.total);
    if (data.allTags && data.allTags.length > 0) {
      setAllTags(data.allTags);
    }
  }, [data, page]);

  // 无限滚动：监听底部元素
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore && !isFetching) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, isFetching]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const copyText = (text: string, type: "zh" | "en" | "card", id?: number) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("已复制");
      if (type === "zh") { setCopiedZh(true); setTimeout(() => setCopiedZh(false), 2000); }
      if (type === "en") { setCopiedEn(true); setTimeout(() => setCopiedEn(false), 2000); }
      if (type === "card" && id) { setCopiedCard(id); setTimeout(() => setCopiedCard(null), 2000); }
    });
  };

  const memberCount = membersData?.length || 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ===== 顶部红色区域 ===== */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        {/* 导航栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={() => setLocation("/ledger/list")}
            className="flex items-center gap-1 text-white/90 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>
          <h1 className="text-base font-semibold text-white truncate max-w-[180px]">
            {ledgerData?.name || "提示词图库"}
          </h1>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="text-white/90 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 成员头像 + 数量 */}
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowMembersDialog(true)}
            className="flex items-center gap-2"
          >
            <div className="flex -space-x-2">
              {(membersData || []).slice(0, 5).map((m: any) => (
                <div key={m.id} className="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-200">
                  <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                </div>
              ))}
            </div>
            <span className="text-xs text-white/80 ml-1">
              <span className="font-semibold" style={{ color: "#FFD700" }}>{memberCount}</span> 人共享
            </span>
            <Users className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>

        {/* 金色标签 */}
        <div className="px-4 pb-3">
          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "rgba(203,164,113,0.2)", color: "#CBA471", border: "1px solid rgba(203,164,113,0.4)" }}>
            Nano Banana Pro · 提示词图库
          </span>
        </div>
      </div>

      {/* ===== 搜索框 ===== */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid #E8E8E8" }}>
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="搜索标题或提示词..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="flex-1 text-sm text-gray-700 bg-transparent outline-none placeholder-gray-400"
          />
          {searchText && (
            <button onClick={() => setSearchText("")}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* ===== 标签筛选栏（横向滚动） ===== */}
      {allTags.length > 0 && (
        <div className="pb-2">
          <div className="flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {/* 全部 */}
            <button
              onClick={() => setActiveTag("")}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium"
              style={{
                backgroundColor: activeTag === "" ? "#D32F2F" : "#FFFFFF",
                color: activeTag === "" ? "#FFFFFF" : "#555",
                border: `1px solid ${activeTag === "" ? "#D32F2F" : "#E0E0E0"}`,
              }}
            >
              全部
            </button>
            {allTags.map((tag, i) => (
              <button
                key={i}
                onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium"
                style={{
                  backgroundColor: activeTag === tag ? "#D32F2F" : "#FFFFFF",
                  color: activeTag === tag ? "#FFFFFF" : "#555",
                  border: `1px solid ${activeTag === tag ? "#D32F2F" : "#E0E0E0"}`,
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== 图片列表 ===== */}
      <div className="pb-8">
        {isLoading && page === 1 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-gray-400">加载中...</div>
          </div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#FFEBEE" }}>
              <ImageIcon className="w-10 h-10" style={{ color: "#D32F2F" }} />
            </div>
            <p className="text-base font-medium text-gray-700 mb-1">
              {keyword || activeTag ? "没有找到匹配的案例" : "图库正在建设中"}
            </p>
            <p className="text-sm text-gray-400 text-center">
              {keyword || activeTag ? "换个关键词或标签试试" : "管理员正在整理 Nano Banana Pro 精选案例"}
            </p>
          </div>
        ) : (
          <div className="pt-2 space-y-3">
            {/* 总数 */}
            <div className="px-4 text-xs text-gray-400">
              共 {total} 个案例{(keyword || activeTag) ? "（已筛选）" : ""}
            </div>

            {allItems.map((img) => {
              const shortTitle = getShortTitle(img.title);
              return (
                <div
                  key={img.id}
                  className="mx-3 bg-white overflow-hidden cursor-pointer"
                  style={{ borderRadius: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
                  onClick={() => setSelectedImage(img)}
                >
                  {/* 图片：按原始比例完整显示，不裁剪 */}
                  <img
                    src={img.imageUrl}
                    alt={shortTitle || "提示词案例"}
                    className="w-full h-auto block"
                    style={{ borderRadius: "12px 12px 0 0" }}
                    loading="lazy"
                  />

                  {/* 底部：标题 + 复制图标（一行） */}
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <p className="text-sm text-gray-800 leading-snug flex-1 truncate" style={{ fontWeight: 500 }}>
                      {shortTitle || "提示词案例"}
                    </p>
                    {img.promptText && (
                      <button
                        onClick={(e) => { e.stopPropagation(); copyText(img.promptText!, "card", img.id); }}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full"
                        style={{
                          backgroundColor: copiedCard === img.id ? "#E8F5E9" : "#FFF8F0",
                          color: copiedCard === img.id ? "#4CAF50" : "#CBA471",
                        }}
                        title="复制提示词"
                      >
                        {copiedCard === img.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 无限滚动触发器 */}
            <div ref={loaderRef} className="flex justify-center py-4">
              {isFetching && (
                <div className="text-xs text-gray-400">加载更多...</div>
              )}
              {!hasMore && allItems.length > 0 && (
                <div className="text-xs text-gray-300">— 已加载全部 {total} 个案例 —</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== 底部抽屉：仿OpenNana详情弹出框 ===== */}
      {selectedImage && (() => {
        const { zh, en } = parsePrompt(selectedImage.promptText);
        const tags = parseTags(selectedImage.tags);
        const shortTitle = getShortTitle(selectedImage.title);
        const author = selectedImage.author || "OpenNana";

        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setSelectedImage(null)}
          >
            {/* 白色抽屉 */}
            <div
              className="w-full bg-white overflow-y-auto"
              style={{ borderRadius: "20px 20px 0 0", maxHeight: "90vh" }}
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部把手 */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "#E0E0E0" }} />
              </div>

              {/* 关闭按钮（右上角） */}
              <div className="flex justify-end px-4 pb-1">
                <button
                  onClick={() => setSelectedImage(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#F0F0F0" }}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="px-4 pb-8">
                {/* 标题 */}
                <h2 className="text-lg font-bold text-gray-900 leading-snug mb-1.5">
                  {shortTitle || "提示词案例"}
                </h2>

                {/* 来源 + 模型 */}
                <p className="text-xs text-gray-400 mb-3">
                  来源：{author} &nbsp;·&nbsp; 模型：Nano banana pro
                </p>

                {/* 标签胶囊 */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: "#F5F5F5", color: "#555", border: "1px solid #E8E8E8" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 示例图片 */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 rounded-full" style={{ backgroundColor: "#1976D2" }} />
                    <span className="text-sm font-semibold text-gray-800">示例图片</span>
                  </div>
                  <img
                    src={selectedImage.imageUrl}
                    alt={shortTitle || "示例图片"}
                    className="w-full h-auto block"
                    style={{ borderRadius: "10px" }}
                  />
                </div>

                {/* 提示词区域 */}
                {(en || zh) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: "#1976D2" }} />
                      <span className="text-sm font-semibold text-gray-800">提示词</span>
                    </div>

                    {/* English 卡片 */}
                    {en && (
                      <div className="mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid #E8E8E8" }}>
                        <div className="flex items-center justify-between px-3 py-2"
                          style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid #F0F0F0" }}>
                          <span className="text-xs font-semibold text-gray-500 tracking-wide">ENGLISH</span>
                          <button
                            onClick={() => copyText(en, "en")}
                            className="text-xs font-medium flex items-center gap-1"
                            style={{ color: copiedEn ? "#4CAF50" : "#1976D2" }}
                          >
                            {copiedEn ? <><Check className="w-3 h-3" />已复制</> : <>复制</>}
                          </button>
                        </div>
                        <div className="px-3 py-3">
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap"
                            style={{ fontFamily: "monospace", fontSize: "13px" }}>
                            {en}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 中文卡片 */}
                    {zh && (
                      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E8E8E8" }}>
                        <div className="flex items-center justify-between px-3 py-2"
                          style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid #F0F0F0" }}>
                          <span className="text-xs font-semibold text-gray-500 tracking-wide">中文</span>
                          <button
                            onClick={() => copyText(zh, "zh")}
                            className="text-xs font-medium flex items-center gap-1"
                            style={{ color: copiedZh ? "#4CAF50" : "#1976D2" }}
                          >
                            {copiedZh ? <><Check className="w-3 h-3" />已复制</> : <>复制</>}
                          </button>
                        </div>
                        <div className="px-3 py-3">
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap"
                            style={{ fontSize: "14px" }}>
                            {zh}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 成员列表弹层 */}
      {showMembersDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowMembersDialog(false)}>
          <div className="w-full bg-white rounded-t-2xl p-4 max-h-80 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-800 mb-3">账本成员 ({memberCount}人)</div>
            <div className="space-y-2">
              {(membersData || []).map((m: any) => (
                <div key={m.id || m.userId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                    <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                  </div>
                  <span className="text-sm text-gray-700">{m.nickname || m.username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
