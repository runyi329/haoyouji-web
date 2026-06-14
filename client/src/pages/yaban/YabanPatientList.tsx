/**
 * 牙伴齿科管理 - 顾客列表页（P0 重构版）
 * 路由：/yaban/patients
 * 能力：顶部统计条 + 强化搜索（防抖）+ 快捷筛选 Chips + 排序 + 无限滚动分页 + 紧凑卡片
 * 数据来源：trpc.yabanCustomer.list / trpc.yabanCustomer.stats（腾讯云 crm_db 真实数据）
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, Search, X, ArrowUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { avatarSrc, ageToBucket, type AvatarKey } from "@/lib/yaban-avatar";
import { PageTag } from "@/components/PageTag";

// 顾客标签类型及配色
type TagType = "female" | "male" | "phone";

interface TagConfig {
  label: string;
  bg: string;
  text: string;
}

const TAG_CONFIG: Record<TagType, TagConfig> = {
  female: { label: "\u5973", bg: "#F97316", text: "#FFFFFF" },
  male: { label: "\u7537", bg: "#0EA5E9", text: "#FFFFFF" },
  phone: { label: "\u7535", bg: "#0EA5E9", text: "#FFFFFF" },
};

// 顾客展示模型
interface CustomerView {
  id: number;
  name: string;
  nickname?: string;
  age: number;
  gender: "female" | "male";
  avatarKey: AvatarKey;
  tags: TagType[];
  recordNo: string;
  source: string;
  lastVisit: string;
  lastDoctor: string;
}

// 快捷筛选 Chips（与后端 quickFilter 对应）
const QUICK_FILTERS = [
  { id: "all", label: "\u5168\u90E8" },
  { id: "today", label: "\u4ECA\u65E5\u65B0\u589E" },
  { id: "week", label: "\u672C\u5468" },
  { id: "new", label: "\u65B0\u987E\u5BA2" },
  { id: "followup", label: "\u5F85\u56DE\u8BBF" },
];

// 排序选项（与后端 sort 对应）
const SORT_OPTIONS = [
  { id: "created", label: "\u521B\u5EFA\u65F6\u95F4" },
  { id: "recent", label: "\u6700\u8FD1\u5C31\u8BCA" },
  { id: "name", label: "\u59D3\u540D" },
  { id: "age", label: "\u5E74\u9F84" },
];

const PAGE_SIZE = 30;

// 将后端记录映射为展示模型
function mapRow(row: any): CustomerView {
  const gender: "female" | "male" = row.gender === "\u5973" ? "female" : "male";
  const age = row.age ? Number(row.age) : 0;
  const tags: TagType[] = [];
  tags.push(gender);
  if (row.mobile) tags.push("phone");
  const sourceText = [row.source, row.net_consultant, row.consultant].filter(Boolean).join(" | ");
  // 头像：优先用顾客保存的 avatar；未保存时按年龄+性别自动适配（与新建页一致）
  const avatarKey: AvatarKey = (row.avatar as AvatarKey) || (`${gender}_${ageToBucket(age)}` as AvatarKey);
  return {
    id: Number(row.id),
    name: row.name,
    nickname: row.nickname || undefined,
    age,
    gender,
    avatarKey,
    tags,
    recordNo: row.medical_no || String(row.id),
    source: sourceText || "\u2014",
    lastVisit: row.last_visit || "",
    lastDoctor: row.last_doctor || "",
  };
}

// 头像组件 - 渲染顾客所选的 12 款默认头像（与新建页联动）
function PatientAvatar({ avatarKey }: { avatarKey: AvatarKey }) {
  return (
    <div className="w-[48px] h-[48px] rounded-full bg-[#F0F7FA] flex-shrink-0 overflow-hidden">
      <img
        src={avatarSrc(avatarKey)}
        alt={"\u987E\u5BA2\u5934\u50CF"}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}

// 骨架屏卡片
function SkeletonCard() {
  return (
    <div className="bg-white px-4 py-3 flex gap-3 animate-pulse">
      <div className="w-[48px] h-[48px] rounded-full bg-gray-100 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2 py-1">
        <div className="h-3.5 bg-gray-100 rounded w-1/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/5" />
      </div>
    </div>
  );
}

export default function YabanPatientList() {
  const [, setLocation] = useLocation();

  // 搜索输入与防抖后的关键词
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 筛选 / 排序 / 分页
  const [quickFilter, setQuickFilter] = useState("all");
  const [sort, setSort] = useState("created");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [page, setPage] = useState(1);

  // 累积的顾客数据
  const [items, setItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // 搜索防抖：输入后 300ms 才更新 keyword
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(searchInput.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // 关键词 / 筛选 / 排序变化时重置分页与累积数据
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(false);
  }, [keyword, quickFilter, sort]);

  // 统计条
  const statsQuery = trpc.yabanCustomer.stats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // 列表查询
  const listQuery = trpc.yabanCustomer.list.useQuery(
    {
      keyword: keyword || undefined,
      quickFilter,
      sort,
      page,
      pageSize: PAGE_SIZE,
    },
    { refetchOnWindowFocus: false }
  );

  // 查询结果合并到累积数组（按 id 去重）
  useEffect(() => {
    const data = listQuery.data;
    if (!data) return;
    setTotal(data.total);
    setHasMore(data.hasMore);
    if (data.page === 1) {
      setItems(data.items);
    } else {
      setItems((prev) => {
        const seen = new Set(prev.map((r) => Number(r.id)));
        const merged = [...prev];
        for (const r of data.items) {
          if (!seen.has(Number(r.id))) {
            merged.push(r);
            seen.add(Number(r.id));
          }
        }
        return merged;
      });
    }
  }, [listQuery.data]);

  const customers: CustomerView[] = useMemo(() => items.map(mapRow), [items]);

  // 无限滚动：监听底部哨兵
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = useCallback(() => {
    if (listQuery.isFetching) return;
    if (!hasMore) return;
    setPage((p) => p + 1);
  }, [listQuery.isFetching, hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleBack = () => setLocation("/yaban");
  const handleCreate = () => setLocation("/yaban/patient/create");
  const handlePatientClick = (patientId: number) => setLocation(`/yaban/patient/${patientId}`);

  const handleCopyRecordNo = (e: React.MouseEvent, recordNo: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(recordNo);
    toast.success("\u75C5\u5386\u53F7\u5DF2\u590D\u5236");
  };

  const stats = statsQuery.data;
  const isFirstLoading = listQuery.isLoading && page === 1;
  const currentSortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label || "\u6392\u5E8F";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-[48px]">
          <button onClick={handleBack} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-[17px] font-bold text-gray-900">{"\u987E\u5BA2"}</h1>
          <button onClick={handleCreate} className="p-1 -mr-1">
            <Plus className="w-6 h-6 text-sky-500" />
          </button>
        </div>

        {/* 统计条 */}
        <div className="flex items-stretch px-4 pb-2.5 pt-0.5 gap-2">
          {[
            { label: "\u603B\u987E\u5BA2", value: stats?.total },
            { label: "\u4ECA\u65E5\u65B0\u589E", value: stats?.today },
            { label: "\u672C\u6708\u65B0\u589E", value: stats?.month },
          ].map((s) => (
            <div
              key={s.label}
              className="flex-1 bg-gray-50 rounded-lg py-2 flex flex-col items-center justify-center"
            >
              <span className="text-[18px] font-bold text-gray-900 leading-tight">
                {statsQuery.isLoading ? "\u2014" : (s.value ?? 0)}
              </span>
              <span className="text-[11px] text-gray-500 mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="sticky top-[48px] z-40 bg-white px-4 pt-1 pb-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={"\u641C\u7D22\u59D3\u540D / \u624B\u673A\u53F7 / \u75C5\u5386\u53F7"}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-9 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none border border-gray-200 focus:border-sky-300 focus:ring-1 focus:ring-sky-100"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* 快捷筛选 Chips + 排序 */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
            {QUICK_FILTERS.map((f) => {
              const active = quickFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setQuickFilter(f.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap transition-colors ${
                    active
                      ? "bg-sky-500 text-white font-medium"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* 排序按钮 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-0.5 px-2 py-1.5 text-[13px] text-gray-600"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{currentSortLabel}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[120px] z-50">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setSort(option.id);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between ${
                        sort === option.id ? "text-sky-600 font-medium" : "text-gray-700"
                      }`}
                    >
                      {option.label}
                      {sort === option.id && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 顾客列表 */}
      <div className="flex-1 overflow-y-auto">
        {isFirstLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">
              {keyword || quickFilter !== "all"
                ? "\u672A\u627E\u5230\u5339\u914D\u7684\u987E\u5BA2"
                : "\u6682\u65E0\u987E\u5BA2\uFF0C\u70B9\u53F3\u4E0A\u89D2 + \u65B0\u5EFA"}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {customers.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => handlePatientClick(patient.id)}
                  className="bg-white px-4 py-3 flex gap-3 cursor-pointer active:bg-gray-50 transition-colors"
                >
                  <PatientAvatar avatarKey={patient.avatarKey} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[15px] font-bold text-gray-900 leading-tight truncate">
                        {patient.name}
                      </span>
                      {patient.nickname && (
                        <span className="text-[12px] text-gray-500 truncate">
                          ({patient.nickname})
                        </span>
                      )}
                      {patient.age > 0 && (
                        <span className="text-[13px] text-gray-500 flex-shrink-0">
                          {patient.age}
                          {"\u5C81"}
                        </span>
                      )}
                      <span className="flex items-center gap-1 ml-auto flex-shrink-0">
                        {patient.tags.map((tag, idx) => {
                          const config = TAG_CONFIG[tag];
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-[10px] font-bold"
                              style={{ backgroundColor: config.bg, color: config.text }}
                            >
                              {config.label}
                            </span>
                          );
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[12px] text-gray-500 truncate">
                        {"\u75C5\u5386\u53F7 "}
                        {patient.recordNo}
                      </span>
                      <button
                        onClick={(e) => handleCopyRecordNo(e, patient.recordNo)}
                        className="text-[11px] text-sky-500 flex-shrink-0"
                      >
                        {"\u590D\u5236"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-gray-400 truncate">
                        {"\u6765\u6E90 "}
                        {patient.source}
                      </span>
                      {patient.lastVisit && (
                        <span className="text-[12px] text-gray-400 flex-shrink-0">
                          {patient.lastVisit}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 无限滚动哨兵 + 加载状态 */}
            <div ref={sentinelRef} className="py-4 flex items-center justify-center">
              {listQuery.isFetching && page > 1 ? (
                <div className="flex items-center gap-2 text-gray-400 text-[13px]">
                  <div className="w-4 h-4 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
                  {"\u52A0\u8F7D\u4E2D"}
                </div>
              ) : !hasMore ? (
                <span className="text-gray-300 text-[12px]">
                  {"\u5171 "}
                  {total}
                  {" \u4F4D\u987E\u5BA2"}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
      <PageTag code="P320" />
    </div>
  );
}
