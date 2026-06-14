/**
 * 牙伴齿科管理 - 顾客列表页（P0 + P1 优化版）
 * 路由：/yaban/patients
 * P0：顶部统计条 + 强化搜索（防抖）+ 快捷筛选 + 排序 + 无限滚动 + 紧凑卡片 + 头像联动
 * P1：拼音索引条(A-Z) + 分组吸顶 + 高级筛选抽屉 + 列表项右滑快捷操作 + 空/异常态 + 搜索历史与联想
 * 数据来源：trpc.yabanCustomer.list / stats / filterOptions（腾讯云 crm_db 真实数据）
 * 规范：严禁 Emoji；性别用文字标签；图标统一 lucide-react；移动端优先
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Plus, Search, X, ArrowUpDown, Check,
  SlidersHorizontal, Phone, ClipboardList, Tag as TagIcon,
  RotateCw, Clock, Inbox,
} from "lucide-react";
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
  mobile: string;
  initial: string;
}

// 快捷筛选（与后端 quickFilter 对应）
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

// 性别筛选项
const GENDER_OPTIONS = [
  { id: "\u7537", label: "\u7537" },
  { id: "\u5973", label: "\u5973" },
  { id: "\u672A\u77E5", label: "\u672A\u77E5" },
];

// 年龄段筛选项（与后端 ageRange 对应）
const AGE_OPTIONS = [
  { id: "child", label: "\u513F\u7AE5(0-12)" },
  { id: "teen", label: "\u9752\u5C11\u5E74(13-17)" },
  { id: "youth", label: "\u9752\u5E74(18-39)" },
  { id: "middle", label: "\u4E2D\u5E74(40-59)" },
  { id: "senior", label: "\u8001\u5E74(60+)" },
];

// A-Z + # 索引字母
const INDEX_LETTERS = ["#", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

const PAGE_SIZE = 30;
const SEARCH_HISTORY_KEY = "yaban_customer_search_history";
const MAX_HISTORY = 8;

// 高级筛选条件类型
interface AdvFilters {
  gender: string;
  ageRange: string;
  source: string;
  consultant: string;
  doctor: string;
  hasMobile: boolean;
}
const EMPTY_ADV: AdvFilters = {
  gender: "", ageRange: "", source: "", consultant: "", doctor: "", hasMobile: false,
};

// 将后端记录映射为展示模型
function mapRow(row: any): CustomerView {
  const gender: "female" | "male" = row.gender === "\u5973" ? "female" : "male";
  const age = row.age ? Number(row.age) : 0;
  const tags: TagType[] = [];
  tags.push(gender);
  if (row.mobile) tags.push("phone");
  const sourceText = [row.source, row.net_consultant, row.consultant].filter(Boolean).join(" | ");
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
    mobile: row.mobile || "",
    initial: row.initial || "#",
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

// 读取搜索历史
function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}
function saveHistory(list: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

// 单个顾客卡片（支持右滑露出快捷操作）
function CustomerRow({
  patient,
  onClick,
  onCopy,
  onCall,
  onFollowUp,
  onTag,
}: {
  patient: CustomerView;
  onClick: () => void;
  onCopy: (e: React.MouseEvent) => void;
  onCall: (e: React.MouseEvent) => void;
  onFollowUp: (e: React.MouseEvent) => void;
  onTag: (e: React.MouseEvent) => void;
}) {
  const [offset, setOffset] = useState(0); // 0 收起，负值露出操作区
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const ACTION_WIDTH = 180; // 三个操作按钮总宽

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
    dragging.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -ACTION_WIDTH) next = -ACTION_WIDTH;
    setOffset(next);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    setOffset((cur) => (cur < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0));
  };

  const handleCardClick = () => {
    if (offset !== 0) {
      setOffset(0);
      return;
    }
    onClick();
  };

  return (
    <div className="relative overflow-hidden bg-white">
      {/* 右滑露出的操作区 */}
      <div className="absolute right-0 top-0 bottom-0 flex">
        <button
          onClick={(e) => { setOffset(0); onCall(e); }}
          className="w-[60px] flex flex-col items-center justify-center bg-emerald-500 text-white text-[11px] gap-0.5"
        >
          <Phone className="w-4 h-4" />
          {"\u62E8\u6253"}
        </button>
        <button
          onClick={(e) => { setOffset(0); onFollowUp(e); }}
          className="w-[60px] flex flex-col items-center justify-center bg-sky-500 text-white text-[11px] gap-0.5"
        >
          <ClipboardList className="w-4 h-4" />
          {"\u968F\u8BBF"}
        </button>
        <button
          onClick={(e) => { setOffset(0); onTag(e); }}
          className="w-[60px] flex flex-col items-center justify-center bg-amber-500 text-white text-[11px] gap-0.5"
        >
          <TagIcon className="w-4 h-4" />
          {"\u6807\u7B7E"}
        </button>
      </div>

      {/* 卡片主体 */}
      <div
        onClick={handleCardClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: dragging.current ? "none" : "transform 0.2s ease" }}
        className="relative bg-white px-4 py-3 flex gap-3 cursor-pointer active:bg-gray-50"
      >
        <PatientAvatar avatarKey={patient.avatarKey} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[15px] font-bold text-gray-900 leading-tight truncate">
              {patient.name}
            </span>
            {patient.nickname && (
              <span className="text-[12px] text-gray-500 truncate">({patient.nickname})</span>
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
            <button onClick={onCopy} className="text-[11px] text-sky-500 flex-shrink-0">
              {"\u590D\u5236"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-gray-400 truncate">
              {"\u6765\u6E90 "}
              {patient.source}
            </span>
            {patient.lastVisit && (
              <span className="text-[12px] text-gray-400 flex-shrink-0">{patient.lastVisit}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function YabanPatientList() {
  const [, setLocation] = useLocation();

  // 搜索输入与防抖后的关键词
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 筛选 / 排序 / 分页
  const [quickFilter, setQuickFilter] = useState("all");
  const [sort, setSort] = useState("created");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [page, setPage] = useState(1);

  // 高级筛选
  const [showAdvDrawer, setShowAdvDrawer] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const [advDraft, setAdvDraft] = useState<AdvFilters>(EMPTY_ADV);

  // 累积的顾客数据
  const [items, setItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // 当索引点击时滚动定位
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 搜索防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(searchInput.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // 关键词 / 筛选 / 排序 / 高级筛选变化时重置分页
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(false);
  }, [keyword, quickFilter, sort, adv]);

  // 统计条
  const statsQuery = trpc.yabanCustomer.stats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // 高级筛选可选项
  const filterOptionsQuery = trpc.yabanCustomer.filterOptions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const filterOptions = filterOptionsQuery.data || { sources: [], consultants: [], doctors: [] };

  // 列表查询
  const listQuery = trpc.yabanCustomer.list.useQuery(
    {
      keyword: keyword || undefined,
      quickFilter,
      sort,
      page,
      pageSize: PAGE_SIZE,
      gender: adv.gender || undefined,
      ageRange: adv.ageRange || undefined,
      source: adv.source || undefined,
      consultant: adv.consultant || undefined,
      doctor: adv.doctor || undefined,
      hasMobile: adv.hasMobile || undefined,
    },
    { refetchOnWindowFocus: false }
  );

  // 合并结果（按 id 去重）
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

  // 是否按姓名排序（此时启用拼音分组与索引条）
  const groupByInitial = sort === "name";

  // 按首字母分组（仅姓名排序时）
  const grouped = useMemo(() => {
    if (!groupByInitial) return null;
    const map = new Map<string, CustomerView[]>();
    for (const c of customers) {
      const key = c.initial || "#";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [customers, groupByInitial]);

  // 当前数据中存在的首字母（用于索引条高亮可用项）
  const activeLetters = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) set.add(c.initial || "#");
    return set;
  }, [customers]);

  // 无限滚动
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
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRef.current, rootMargin: "200px" }
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

  // 快捷操作
  const handleCall = (e: React.MouseEvent, p: CustomerView) => {
    e.stopPropagation();
    if (!p.mobile) {
      toast.error("\u8BE5\u987E\u5BA2\u672A\u767B\u8BB0\u624B\u673A\u53F7");
      return;
    }
    window.location.href = `tel:${p.mobile}`;
  };
  const handleFollowUp = (e: React.MouseEvent, p: CustomerView) => {
    e.stopPropagation();
    setLocation(`/yaban/patient/${p.id}?action=followup`);
  };
  const handleTag = (e: React.MouseEvent, p: CustomerView) => {
    e.stopPropagation();
    setLocation(`/yaban/patient/${p.id}?action=tag`);
  };

  // 提交搜索（记录历史）
  const commitSearch = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setHistory((prev) => {
      const next = [t, ...prev.filter((x) => x !== t)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  };
  const handleSearchEnter = () => {
    commitSearch(searchInput);
    setSearchFocused(false);
  };
  const applyHistory = (term: string) => {
    setSearchInput(term);
    commitSearch(term);
    setSearchFocused(false);
  };
  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  // 索引条点击：滚动到对应分组
  const scrollToLetter = (letter: string) => {
    const el = groupRefs.current[letter];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // 打开高级筛选抽屉时同步草稿
  const openAdvDrawer = () => {
    setAdvDraft(adv);
    setShowAdvDrawer(true);
  };
  const applyAdv = () => {
    setAdv(advDraft);
    setShowAdvDrawer(false);
  };
  const resetAdv = () => {
    setAdvDraft(EMPTY_ADV);
  };

  const stats = statsQuery.data;
  const isFirstLoading = listQuery.isLoading && page === 1;
  const isError = listQuery.isError;
  const currentSortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label || "\u6392\u5E8F";
  // 高级筛选激活数量
  const advCount = useMemo(() => {
    let n = 0;
    if (adv.gender) n++;
    if (adv.ageRange) n++;
    if (adv.source) n++;
    if (adv.consultant) n++;
    if (adv.doctor) n++;
    if (adv.hasMobile) n++;
    return n;
  }, [adv]);

  // 渲染列表主体内容
  const renderRows = () => {
    if (groupByInitial && grouped) {
      const orderedKeys = INDEX_LETTERS.filter((l) => grouped.has(l));
      return (
        <div>
          {orderedKeys.map((letter) => (
            <div
              key={letter}
              ref={(el) => { groupRefs.current[letter] = el; }}
            >
              <div className="sticky top-0 z-10 bg-gray-100 px-4 py-1 text-[12px] font-bold text-gray-500">
                {letter}
              </div>
              <div className="divide-y divide-gray-100">
                {grouped.get(letter)!.map((patient) => (
                  <CustomerRow
                    key={patient.id}
                    patient={patient}
                    onClick={() => handlePatientClick(patient.id)}
                    onCopy={(e) => handleCopyRecordNo(e, patient.recordNo)}
                    onCall={(e) => handleCall(e, patient)}
                    onFollowUp={(e) => handleFollowUp(e, patient)}
                    onTag={(e) => handleTag(e, patient)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="divide-y divide-gray-100">
        {customers.map((patient) => (
          <CustomerRow
            key={patient.id}
            patient={patient}
            onClick={() => handlePatientClick(patient.id)}
            onCopy={(e) => handleCopyRecordNo(e, patient.recordNo)}
            onCall={(e) => handleCall(e, patient)}
            onFollowUp={(e) => handleFollowUp(e, patient)}
            onTag={(e) => handleTag(e, patient)}
          />
        ))}
      </div>
    );
  };

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

        {/* 统计条（点击联动快捷筛选） */}
        <div className="flex items-stretch px-4 pb-2.5 pt-0.5 gap-2">
          {[
            { label: "\u603B\u987E\u5BA2", value: stats?.total, filter: "all" },
            { label: "\u4ECA\u65E5\u65B0\u589E", value: stats?.today, filter: "today" },
            { label: "\u672C\u6708\u65B0\u589E", value: stats?.month, filter: "new" },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => setQuickFilter(s.filter)}
              className="flex-1 bg-gray-50 rounded-lg py-2 flex flex-col items-center justify-center active:bg-gray-100"
            >
              <span className="text-[18px] font-bold text-gray-900 leading-tight">
                {statsQuery.isLoading ? "\u2014" : (s.value ?? 0)}
              </span>
              <span className="text-[11px] text-gray-500 mt-0.5">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="sticky top-[48px] z-40 bg-white px-4 pt-1 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={"\u641C\u7D22\u59D3\u540D / \u624B\u673A\u53F7 / \u75C5\u5386\u53F7"}
              value={searchInput}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearchEnter(); }}
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
          {/* 高级筛选入口 */}
          <button
            onClick={openAdvDrawer}
            className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200"
          >
            <SlidersHorizontal className={`w-4 h-4 ${advCount > 0 ? "text-sky-500" : "text-gray-500"}`} />
            {advCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
                {advCount}
              </span>
            )}
          </button>
        </div>

        {/* 搜索历史下拉 */}
        {searchFocused && history.length > 0 && (
          <div className="absolute left-4 right-4 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
            <div className="flex items-center justify-between px-3 pb-1.5">
              <span className="text-[12px] text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {"\u641C\u7D22\u5386\u53F2"}
              </span>
              <button onClick={clearHistory} className="text-[12px] text-gray-400">
                {"\u6E05\u7A7A"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3">
              {history.map((h) => (
                <button
                  key={h}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyHistory(h)}
                  className="px-2.5 py-1 bg-gray-100 rounded-full text-[12px] text-gray-600"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 快捷筛选 + 排序 */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
            {QUICK_FILTERS.map((f) => {
              const active = quickFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setQuickFilter(f.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap transition-colors ${
                    active ? "bg-sky-500 text-white font-medium" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {isFirstLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-32 px-8">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <X className="w-8 h-8 text-red-300" />
            </div>
            <p className="text-gray-500 text-sm mb-4">{"\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"}</p>
            <button
              onClick={() => listQuery.refetch()}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm"
            >
              <RotateCw className="w-4 h-4" />
              {"\u91CD\u65B0\u52A0\u8F7D"}
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-8">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              {keyword || quickFilter !== "all" || advCount > 0 ? (
                <Search className="w-8 h-8 text-gray-300" />
              ) : (
                <Inbox className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <p className="text-gray-400 text-sm mb-4 text-center">
              {keyword || quickFilter !== "all" || advCount > 0
                ? "\u672A\u627E\u5230\u5339\u914D\u7684\u987E\u5BA2"
                : "\u6682\u65E0\u987E\u5BA2"}
            </p>
            {keyword || quickFilter !== "all" || advCount > 0 ? (
              <button
                onClick={() => {
                  setSearchInput("");
                  setQuickFilter("all");
                  setAdv(EMPTY_ADV);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
              >
                {"\u6E05\u9664\u7B5B\u9009\u6761\u4EF6"}
              </button>
            ) : (
              <button
                onClick={handleCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm"
              >
                <Plus className="w-4 h-4" />
                {"\u65B0\u5EFA\u987E\u5BA2"}
              </button>
            )}
          </div>
        ) : (
          <>
            {renderRows()}
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

        {/* 拼音索引条（仅姓名排序时显示） */}
        {groupByInitial && customers.length > 0 && (
          <div className="fixed right-0.5 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center py-1">
            {INDEX_LETTERS.map((letter) => {
              const enabled = activeLetters.has(letter);
              return (
                <button
                  key={letter}
                  onClick={() => enabled && scrollToLetter(letter)}
                  className={`text-[10px] leading-[14px] w-4 h-[14px] flex items-center justify-center ${
                    enabled ? "text-sky-500 font-bold" : "text-gray-300"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 高级筛选抽屉 */}
      {showAdvDrawer && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowAdvDrawer(false)}
          />
          <div className="relative bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-[16px] font-bold text-gray-900">{"\u9AD8\u7EA7\u7B5B\u9009"}</span>
              <button onClick={() => setShowAdvDrawer(false)} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* 性别 */}
              <FilterGroup title={"\u6027\u522B"}>
                {GENDER_OPTIONS.map((o) => (
                  <FilterChip
                    key={o.id}
                    active={advDraft.gender === o.id}
                    onClick={() =>
                      setAdvDraft((d) => ({ ...d, gender: d.gender === o.id ? "" : o.id }))
                    }
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </FilterGroup>

              {/* 年龄段 */}
              <FilterGroup title={"\u5E74\u9F84\u6BB5"}>
                {AGE_OPTIONS.map((o) => (
                  <FilterChip
                    key={o.id}
                    active={advDraft.ageRange === o.id}
                    onClick={() =>
                      setAdvDraft((d) => ({ ...d, ageRange: d.ageRange === o.id ? "" : o.id }))
                    }
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </FilterGroup>

              {/* 来源 */}
              {filterOptions.sources.length > 0 && (
                <FilterGroup title={"\u6765\u6E90\u6E20\u9053"}>
                  {filterOptions.sources.map((o) => (
                    <FilterChip
                      key={o}
                      active={advDraft.source === o}
                      onClick={() =>
                        setAdvDraft((d) => ({ ...d, source: d.source === o ? "" : o }))
                      }
                    >
                      {o}
                    </FilterChip>
                  ))}
                </FilterGroup>
              )}

              {/* 咨询师 */}
              {filterOptions.consultants.length > 0 && (
                <FilterGroup title={"\u54A8\u8BE2\u5E08"}>
                  {filterOptions.consultants.map((o) => (
                    <FilterChip
                      key={o}
                      active={advDraft.consultant === o}
                      onClick={() =>
                        setAdvDraft((d) => ({ ...d, consultant: d.consultant === o ? "" : o }))
                      }
                    >
                      {o}
                    </FilterChip>
                  ))}
                </FilterGroup>
              )}

              {/* 负责医生 */}
              {filterOptions.doctors.length > 0 && (
                <FilterGroup title={"\u8D1F\u8D23\u533B\u751F"}>
                  {filterOptions.doctors.map((o) => (
                    <FilterChip
                      key={o}
                      active={advDraft.doctor === o}
                      onClick={() =>
                        setAdvDraft((d) => ({ ...d, doctor: d.doctor === o ? "" : o }))
                      }
                    >
                      {o}
                    </FilterChip>
                  ))}
                </FilterGroup>
              )}

              {/* 有无手机号 */}
              <FilterGroup title={"\u8054\u7CFB\u65B9\u5F0F"}>
                <FilterChip
                  active={advDraft.hasMobile}
                  onClick={() => setAdvDraft((d) => ({ ...d, hasMobile: !d.hasMobile }))}
                >
                  {"\u4EC5\u770B\u6709\u624B\u673A\u53F7"}
                </FilterChip>
              </FilterGroup>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
              <button
                onClick={resetAdv}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
              >
                {"\u91CD\u7F6E"}
              </button>
              <button
                onClick={applyAdv}
                className="flex-[2] py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium"
              >
                {"\u67E5\u770B\u7ED3\u679C"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PageTag code="P320" />
    </div>
  );
}

// 筛选分组容器
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// 筛选标签
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[13px] transition-colors ${
        active ? "bg-sky-500 text-white font-medium" : "bg-gray-100 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
