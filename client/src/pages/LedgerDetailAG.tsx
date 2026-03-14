/**
 * LedgerDetailAG.tsx - AG型定制账本：共享图片助记词（只读浏览模式）
 *
 * 功能：
 *   - 分页加载（每次20条，滚动到底自动加载更多）
 *   - 顶部"标签"按钮 → 底部iOS风格标签选择弹出框（胶囊网格布局）
 *   - 搜索框（关键词搜索标题/提示词）
 *   - 点击图片弹出白色底部抽屉（仿OpenNana详情页）
 *
 * 权限：所有成员只读浏览，内容由管理员批量导入
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Tag,
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

/** 判断是否为中文字符 */
function isChinese(str: string): boolean {
  return /[\u4e00-\u9fa5]/.test(str);
}

/** 从标题提取主标题（去掉 # 标签部分） */
function getShortTitle(title: string | null): string {
  if (!title) return "";
  const hashIdx = title.indexOf("  #");
  return hashIdx > 0 ? title.slice(0, hashIdx) : title;
}

// 分类关键词映射（用于对标签进行归类排序）
const TAG_CATEGORY_ORDER: Record<string, number> = {
  // 风格类（0）
  "电影感": 0, "超写实": 0, "写实": 0, "极简": 0, "超现实": 0, "复古": 0,
  "赛博朋克": 0, "奢华": 0, "梦幻": 0, "唯美": 0, "科幻": 0, "奇幻": 0,
  "哥特": 0, "千禧风": 0, "日系": 0, "韩系": 0, "复古风": 0, "极简风": 0,
  "写实风": 0, "胶片": 0, "胶片感": 0, "胶片风": 0, "涂鸦风": 0, "漫画": 0,
  "插画": 0, "动漫风": 0, "皮克斯": 0, "Q版": 0, "手绘": 0, "素描": 0,
  "水彩": 0, "油画": 0, "暗黑": 0, "治愈": 0, "赛博风": 0, "未来感": 0,
  // 人像类（1）
  "人像": 1, "少女": 1, "自拍": 1, "写真": 1, "时尚": 1, "性感": 1,
  "美少女": 1, "美女": 1, "女神": 1, "模特": 1, "肖像": 1, "俏皮": 1,
  "甜妹": 1, "甜酷": 1, "纯欲": 1, "优雅": 1, "冷艳": 1, "金发": 1,
  "红发": 1, "银发": 1, "雀斑": 1, "比基尼": 1, "情侣": 1, "情侣写真": 1,
  "健身": 1, "运动风": 1, "韩系女神": 1, "网红": 1, "偶像": 1, "青春": 1,
  // 摄影技法（2）
  "特写": 2, "俯拍": 2, "广角": 2, "逆光": 2, "闪光灯": 2, "夜景": 2,
  "微距": 2, "抓拍": 2, "仰拍": 2, "逼真": 2, "高清": 2, "超高清": 2,
  "8K超清": 2, "8K高清": 2, "8K画质": 2, "高画质": 2, "高质感": 2,
  "高对比": 2, "光影": 2, "暖光": 2, "柔光": 2, "霓虹": 2, "霓虹光": 2,
  "电影质感": 2, "电影光": 2, "黄金时刻": 2, "晨光": 2, "阳光": 2,
  // 场景类（3）
  "街拍": 3, "卧室": 3, "居家": 3, "咖啡馆": 3, "夏日": 3, "雪景": 3,
  "建筑": 3, "都市": 3, "海滩": 3, "厨房": 3, "图书馆": 3, "博物馆": 3,
  "地标": 3, "纽约": 3, "土耳其": 3, "冬季": 3, "圣诞节": 3, "雨夜": 3,
  "夜拍": 3, "日落": 3, "街头": 3, "街头风": 3, "工作室": 3, "影棚": 3,
  // 创意/设计（4）
  "信息图": 4, "九宫格": 4, "四宫格": 4, "微缩": 4, "微缩模型": 4,
  "拼贴": 4, "分镜": 4, "等距": 4, "3D渲染": 4, "3D卡通": 4, "3D立体": 4,
  "创意": 4, "创意广告": 4, "广告": 4, "商业": 4, "商业摄影": 4,
  "商业广告": 4, "海报": 4, "品牌": 4, "平铺": 4, "折纸": 4, "纸艺": 4,
  // 美食/产品（5）
  "美食": 5, "美食摄影": 5, "产品摄影": 5, "芝士": 5, "草莓": 5,
  "香蕉": 5, "甜点": 5, "甜品": 5, "香水": 5, "护肤": 5, "护肤品": 5,
  "美妆": 5, "食谱": 5, "珠宝": 5, "豪车": 5, "奢侈品": 5,
};

/** 对标签进行分类排序，返回分组后的结构 */
function categorizeTags(tagCounts: Record<string, number>): Array<{group: string; tags: Array<{name: string; count: number}>}> {
  const groups: Record<string, Array<{name: string; count: number}>> = {
    "热门": [],
    "人像·风格": [],
    "摄影·光影": [],
    "场景·地点": [],
    "创意·设计": [],
    "美食·产品": [],
    "其他": [],
  };

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  for (const [tag, count] of sortedTags) {
    if (!isChinese(tag)) continue;
    const catOrder = TAG_CATEGORY_ORDER[tag];
    if (count >= 20) {
      groups["热门"].push({ name: tag, count });
    } else if (catOrder === 0) {
      groups["人像·风格"].push({ name: tag, count });
    } else if (catOrder === 1) {
      groups["人像·风格"].push({ name: tag, count });
    } else if (catOrder === 2) {
      groups["摄影·光影"].push({ name: tag, count });
    } else if (catOrder === 3) {
      groups["场景·地点"].push({ name: tag, count });
    } else if (catOrder === 4) {
      groups["创意·设计"].push({ name: tag, count });
    } else if (catOrder === 5) {
      groups["美食·产品"].push({ name: tag, count });
    } else if (count >= 3) {
      groups["其他"].push({ name: tag, count });
    }
  }

  return Object.entries(groups)
    .filter(([, tags]) => tags.length > 0)
    .map(([group, tags]) => ({ group, tags }));
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

  // 标签弹出框
  const [showTagModal, setShowTagModal] = useState(false);

  // 分页状态
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<PromptImage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
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
    // 统计标签数量（从当前页数据中累积）
    if (page === 1 && data.tagCounts) {
      setTagCounts(data.tagCounts as Record<string, number>);
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

  // 分组标签（用于弹出框展示）
  const groupedTags = useMemo(() => categorizeTags(tagCounts), [tagCounts]);

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
          <h1 className="text-base font-semibold text-white truncate max-w-[160px]">
            {ledgerData?.name || "提示词图库"}
          </h1>
          {/* 右侧：标签按钮 + 设置 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTagModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: activeTag ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
                color: "#FFFFFF",
                border: activeTag ? "1px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.3)",
              }}
            >
              <Tag className="w-3 h-3" />
              <span className="max-w-[60px] truncate">{activeTag || "标签"}</span>
            </button>
            {/* 设置按钮：仅账本创建者可见 */}
            {(user?.id === ledgerData?.ownerId || user?.id === ledgerData?.createdBy) && (
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                className="text-white/90 hover:text-white"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
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


      </div>

      {/* ===== 搜索框 + 当前标签提示 ===== */}
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
        {/* 当前激活标签提示条 */}
        {activeTag && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <span className="text-xs text-gray-500">当前标签：</span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
              style={{ backgroundColor: "#FFEBEE", color: "#D32F2F", border: "1px solid #FFCDD2" }}
            >
              {activeTag}
              {tagCounts[activeTag] && (
                <span className="opacity-70">({tagCounts[activeTag]})</span>
              )}
              <button onClick={() => setActiveTag("")} className="ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
      </div>

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

      {/* ===== iOS风格标签选择弹出框（胶囊网格） ===== */}
      {showTagModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowTagModal(false)}
        >
          <div
            className="w-full bg-white overflow-hidden"
            style={{ borderRadius: "20px 20px 0 0", maxHeight: "78vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "#E0E0E0" }} />
            </div>

            {/* 标题栏（含全部按钮） */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-gray-900">选择标签</span>
                <button
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: activeTag === "" ? "#D32F2F" : "#F0F0F0",
                    color: activeTag === "" ? "#FFFFFF" : "#555",
                    border: `1px solid ${activeTag === "" ? "#D32F2F" : "#E0E0E0"}`,
                  }}
                  onClick={() => { setActiveTag(""); setShowTagModal(false); }}
                >
                  全部
                  <span className="text-xs opacity-70">{total > 0 ? total : ""}</span>
                </button>
              </div>
              <button
                onClick={() => setShowTagModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#F0F0F0" }}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {/* 标签内容区（可滚动） */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(78vh - 140px)" }}>
              {/* 分组标签 */}
              {/* 分组标签 */}
              {groupedTags.length > 0 ? (
                groupedTags.map(({ group, tags }) => (
                  <div key={group} className="px-4 pb-3">
                    {/* 分组标题 */}
                    <div className="flex items-center gap-2 mb-2 pt-1">
                      <span className="text-xs font-semibold text-gray-400 tracking-wide">{group}</span>
                      <div className="flex-1 h-px" style={{ backgroundColor: "#F0F0F0" }} />
                    </div>
                    {/* 胶囊标签网格 */}
                    <div className="flex flex-wrap gap-2">
                      {tags.map(({ name, count }) => (
                        <button
                          key={name}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm"
                          style={{
                            backgroundColor: activeTag === name ? "#D32F2F" : "#F5F5F5",
                            color: activeTag === name ? "#FFFFFF" : "#444",
                            border: `1px solid ${activeTag === name ? "#D32F2F" : "#E8E8E8"}`,
                            fontWeight: activeTag === name ? 600 : 400,
                          }}
                          onClick={() => { setActiveTag(name); setShowTagModal(false); }}
                        >
                          {name}
                          <span
                            className="text-xs"
                            style={{ opacity: 0.65, fontSize: "11px" }}
                          >
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                /* 数据还未加载时，直接用allTags展示（不分组） */
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2 pt-2">
                    {allTags.filter(isChinese).map((tag, i) => (
                      <button
                        key={i}
                        className="inline-flex items-center px-3 py-1.5 rounded-full text-sm"
                        style={{
                          backgroundColor: activeTag === tag ? "#D32F2F" : "#F5F5F5",
                          color: activeTag === tag ? "#FFFFFF" : "#444",
                          border: `1px solid ${activeTag === tag ? "#D32F2F" : "#E8E8E8"}`,
                        }}
                        onClick={() => { setActiveTag(tag); setShowTagModal(false); }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 底部安全区 */}
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}

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
