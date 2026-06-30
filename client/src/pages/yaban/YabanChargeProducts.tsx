/**
 * 牙伴齿科管理 - 收费项目库（三级结构）
 * 路由：/yaban/settings/charge-products
 *
 * 层级：
 *  一级分类（可折叠/展开）
 *    └─ 二级分类（平铺，带序号 1.1 / 1.2）
 *         └─ 三级分类（平铺，带序号 1.1.1 / 1.1.2）
 *    └─ 直接挂一级的项目（平铺，带序号 1.1 / 1.2）
 *
 * 每级均有名称 + 价格/单位（可选）
 * 严禁 Emoji，仅用 lucide-react 图标
 */
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  Star,
  Layers,
  Check,
  Search,
  EyeOff,
  Eye,
  ArrowUpDown,
  Settings2,
  GripVertical,
  Copy,
  History,
  TrendingDown,
} from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

const ACCENT = "#1E88D6";

type PageMode = "preview" | "sort-cat" | "sort-sub" | "sort-prod" | "edit";

// ===== 数据类型 =====
interface ProdItem {
  id: number;
  categoryId: number | null;
  subcategoryId: number | null;
  name: string;
  unit: string;
  price: number;
  priceMax?: number;
  isCommon: boolean;
  enabled: boolean;
  sort: number;
}

interface SubCatGroup {
  id: number;
  parentId: number;
  name: string;
  unit: string;
  price: number;
  priceMax?: number;
  sort: number;
  enabled: boolean;
  items: ProdItem[]; // 三级分类
}

interface CatGroup {
  id: number;
  name: string;
  unit: string;
  price: number;
  priceMax?: number;
  sort: number;
  enabled: boolean;
  subCategories: SubCatGroup[]; // 二级分类
  items: ProdItem[]; // 直接挂一级的项目
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function PriceTag({ price, priceMax, unit }: { price: number; priceMax?: number; unit: string }) {
  if (!unit && price === 0) return null;
  const isRange = priceMax && priceMax > 0 && priceMax !== price;
  return (
    <span className="shrink-0 text-sm font-semibold tabular-nums">
      {price > 0
        ? <span className="text-gray-700">
            {isRange ? `${money(price)}~${money(priceMax!)}` : money(price)}
            <span className="text-xs font-normal text-gray-400"> / {unit || "次"}</span>
          </span>
        : unit
          ? <span className="text-orange-400">面议<span className="text-xs font-normal"> / {unit}</span></span>
          : null
      }
    </span>
  );
}

// ===== 可拖拽一级分类行（排序模式） =====
function SortableCatRow({ cat, isSaving }: { cat: CatGroup; isSaving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat-${cat.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-1 px-4 py-3 select-none">
        <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
        <span className="text-sm font-bold text-gray-800 flex-1 ml-1 truncate">{cat.name}</span>
        <button
          {...attributes}
          {...listeners}
          className={`p-2 rounded-lg touch-none ${isSaving ? "text-gray-200" : "text-gray-400 active:text-[#1E88D6] active:bg-blue-50"}`}
          aria-label="拖拽排序"
          style={{ touchAction: "none" }}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GripVertical className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ===== 可拖拽二级分类行（排序模式） =====
function SortableSubRow({ sub, isSaving }: { sub: SubCatGroup; isSaving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `sub-${sub.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 select-none">
        <span className="text-sm text-gray-700 flex-1 truncate">{sub.name}</span>
        {(sub.price > 0 || sub.unit) && (
          <span className="text-xs text-gray-400 shrink-0">{sub.price > 0 ? `${sub.price}` : "面议"} / {sub.unit || "次"}</span>
        )}
        <button
          {...attributes}
          {...listeners}
          className={`p-2 rounded-lg touch-none ${isSaving ? "text-gray-200" : "text-gray-400 active:text-[#1E88D6] active:bg-blue-50"}`}
          aria-label="拖拽排序"
          style={{ touchAction: "none" }}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GripVertical className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ===== 可拖拽三级分类行（排序模式） =====
function SortableProdRow({ prod, isSaving }: { prod: ProdItem; isSaving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `prod-${prod.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 select-none">
        <span className="text-sm text-gray-700 flex-1 truncate">{prod.name}</span>
        {(prod.price > 0 || prod.unit) && (
          <span className="text-xs text-gray-400 shrink-0">{prod.price > 0 ? `${prod.price}` : "面议"} / {prod.unit || "次"}</span>
        )}
        <button
          {...attributes}
          {...listeners}
          className={`p-2 rounded-lg touch-none ${isSaving ? "text-gray-200" : "text-gray-400 active:text-[#1E88D6] active:bg-blue-50"}`}
          aria-label="拖拽排序"
          style={{ touchAction: "none" }}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GripVertical className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function YabanChargeProducts() {
  const goBack = useSmartBack("/yaban/profile");
  const [, navigate] = useLocation();
  const { currentTenantId, current: currentClinic } = useYabanClinic();
  const clinicName = currentClinic?.name || "当前门诊";

  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: membership } = trpc.yabanRole.myMembership.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { refetchOnWindowFocus: false }
  );
  const canManage = !!(membership?.canManage || membership?.permissions?.includes("finance"));

  const listQuery = trpc.yabanCustomer.listChargeProducts.useQuery(
    { includeDisabled: true },
    { refetchOnWindowFocus: false }
  );
  const rawCategories: CatGroup[] = (listQuery.data?.categories as CatGroup[]) || [];

  const saveCat = trpc.yabanCustomer.saveChargeCategory.useMutation();
  const delCat = trpc.yabanCustomer.deleteChargeCategory.useMutation();
  const saveProd = trpc.yabanCustomer.saveChargeProduct.useMutation();
  const delProd = trpc.yabanCustomer.deleteChargeProduct.useMutation();
  const toggleCommon = trpc.yabanCustomer.toggleProductCommon.useMutation();
  const executeCopy = trpc.yabanCustomer.executeChargeCopy.useMutation();

  const refresh = () => utils.yabanCustomer.listChargeProducts.invalidate();

  // ===== 调价记录弹层状态 =====
  // type: "product"(项目级) | "global"(全局级)
  const [priceHistorySheet, setPriceHistorySheet] = useState<{
    type: "product" | "global";
    productId?: number;
    productName?: string;
  } | null>(null);
  const [priceHistoryRecords, setPriceHistoryRecords] = useState<any[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);

  // 打开调价记录弹层：先 invalidate 清缓存，再 fetch，确保每次都从服务器拿最新数据
  const openPriceHistory = async (sheet: { type: "product" | "global"; productId?: number; productName?: string }) => {
    setPriceHistorySheet(sheet);
    setPriceHistoryRecords([]);
    setPriceHistoryLoading(true);
    try {
      const input = {
        productId: sheet.type === "product" ? sheet.productId : undefined,
        limit: 50,
      };
      await utils.yabanCustomer.listPriceHistory.invalidate(input);
      const res = await utils.yabanCustomer.listPriceHistory.fetch(input);
      setPriceHistoryRecords(res?.records ?? []);
    } catch (e) {
      console.error("[priceHistory] fetch error", e);
      setPriceHistoryRecords([]);
    } finally {
      setPriceHistoryLoading(false);
    }
  };

  // ===== 复制弹层状态 =====
  // 步骤："select"(选门诊) -> "analyze"(分析中) -> "confirm"(确认冲突) -> "done"(完成)
  type CopyStep = "select" | "analyze" | "confirm" | "done";
  const [copySheet, setCopySheet] = useState<{
    step: CopyStep;
    fromTenantId: number | null;
    toTenantId: number | null;
    analysis: any | null;
    catActions: Record<string, "overwrite" | "skip">;
    prodActions: Record<string, "overwrite" | "skip">;
    result: any | null;
  } | null>(null);

  // 获取用户名下所有门诊（复用 listExportableClinics）
  const clinicsQuery = trpc.yabanCustomer.listExportableClinics.useQuery(
    undefined,
    { enabled: !!copySheet, staleTime: 60000 }
  );
  const allClinics = clinicsQuery.data?.clinics ?? [];

  // 差异分析查询（仅在 step=analyze 时触发）
  const analyzeQuery = trpc.yabanCustomer.analyzeChargeCopy.useQuery(
    {
      fromTenantId: copySheet?.fromTenantId ?? 0,
      toTenantId: copySheet?.toTenantId ?? 0,
    },
    {
      enabled: !!(copySheet?.step === "analyze" && copySheet.fromTenantId && copySheet.toTenantId),
      staleTime: 0,
    }
  );

  // 监听分析结果，自动进入确认步骤
  const prevAnalyzeStep = useRef<CopyStep | null>(null);
  if (copySheet?.step === "analyze" && analyzeQuery.data && prevAnalyzeStep.current !== "confirm") {
    prevAnalyzeStep.current = "confirm";
    const data = analyzeQuery.data;
    // 默认所有冲突项都是 skip
    const defaultCatActions: Record<string, "overwrite" | "skip"> = {};
    const defaultProdActions: Record<string, "overwrite" | "skip"> = {};
    for (const c of data.catAnalysis) if (c.conflict) defaultCatActions[String(c.id)] = "skip";
    for (const p of data.prodAnalysis) if (p.conflict) defaultProdActions[String(p.id)] = "skip";
    setTimeout(() => setCopySheet((prev) => prev ? { ...prev, step: "confirm", analysis: data, catActions: defaultCatActions, prodActions: defaultProdActions } : prev), 0);
  }
  if (copySheet?.step !== "analyze") prevAnalyzeStep.current = null;

  const [isCopying, setIsCopying] = useState(false);

  const handleExecuteCopy = async () => {
    if (!copySheet?.fromTenantId || !copySheet.toTenantId) return;
    setIsCopying(true);
    try {
      const res = await executeCopy.mutateAsync({
        fromTenantId: copySheet.fromTenantId,
        toTenantId: copySheet.toTenantId,
        catConflictActions: copySheet.catActions,
        prodConflictActions: copySheet.prodActions,
      });
      setCopySheet((prev) => prev ? { ...prev, step: "done", result: res } : prev);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "复制失败，请重试");
    } finally {
      setIsCopying(false);
    }
  };

  // ===== 页面模式 =====
  const [mode, setMode] = useState<PageMode>("preview");
  const [showManagePicker, setShowManagePicker] = useState(false);

  // ===== 排序模式本地快照（三级通用） =====
  const [localCats, setLocalCats] = useState<CatGroup[]>([]);
  const [localSubCats, setLocalSubCats] = useState<SubCatGroup[]>([]);
  const [localProds, setLocalProds] = useState<ProdItem[]>([]);
  const [isSavingSort, setIsSavingSort] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // 排序时选择的父级
  const [sortParentCatId, setSortParentCatId] = useState<number | null>(null);
  const [sortParentSubId, setSortParentSubId] = useState<number | null>(null);

  // ===== 搜索 =====
  const [searchText, setSearchText] = useState("");

  // 搜索频率记录
  const SEARCH_FREQ_KEY = `yaban_charge_search_freq_${currentTenantId}`;
  const getSearchFreq = useCallback((): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem(SEARCH_FREQ_KEY) || "{}"); } catch { return {}; }
  }, [SEARCH_FREQ_KEY]);
  const recordSearchFreq = useCallback((name: string) => {
    const freq = getSearchFreq();
    freq[name] = (freq[name] || 0) + 1;
    localStorage.setItem(SEARCH_FREQ_KEY, JSON.stringify(freq));
  }, [getSearchFreq, SEARCH_FREQ_KEY]);

  // ===== 一级折叠 =====
  const [collapsedCats, setCollapsedCats] = useState<Set<number>>(new Set());
  const toggleCollapse = (catId: number) => {
    if (mode !== "preview") return;
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // ===== 停用项目显示开关 =====
  const [showDisabled, setShowDisabled] = useState(false);

  // ===== 删除确认弹层 =====
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "cat" | "subcat" | "prod";
    id: number;
    name: string;
  } | null>(null);

  // ===== 排序后的一级分类 =====
  const sortedCategories = useMemo(
    () => [...rawCategories].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [rawCategories]
  );

  // ===== 模式切换 =====
  const enterMode = (m: PageMode) => {
    setSearchText("");
    if (m === "sort-cat") {
      setLocalCats([...sortedCategories]);
      setSortParentCatId(null);
      setSortParentSubId(null);
    } else if (m === "sort-sub") {
      setSortParentCatId(null);
      setSortParentSubId(null);
      setLocalSubCats([]);
    } else if (m === "sort-prod") {
      setSortParentCatId(null);
      setSortParentSubId(null);
      setLocalProds([]);
    }
    setMode(m);
  };

  // 选择一级分类后加载二级快照
  const selectSortCat = (catId: number | null) => {
    if (catId === null) { setSortParentCatId(null); setSortParentSubId(null); return; }
    const cat = sortedCategories.find((c) => c.id === catId);
    if (!cat) return;
    setSortParentCatId(catId);
    setSortParentSubId(null);
    if (mode === "sort-sub") {
      // 二级 = 真正的 subCategories + 直接挂一级的项目（展示为二级）
      const subList: SubCatGroup[] = [
        ...cat.subCategories.sort((a, b) => a.sort - b.sort || a.id - b.id),
      ];
      setLocalSubCats(subList);
    } else if (mode === "sort-prod") {
      // 三级排序需要再选二级
      setLocalProds([]);
    }
  };

  // 选择二级分类后加载三级快照
  const selectSortSub = (subId: number | null) => {
    if (subId === null) { setSortParentSubId(null); return; }
    const cat = sortedCategories.find((c) => c.id === sortParentCatId);
    if (!cat) return;
    const sub = cat.subCategories.find((s) => s.id === subId);
    if (!sub) return;
    setSortParentSubId(subId);
    setLocalProds([...sub.items].sort((a, b) => a.sort - b.sort || a.id - b.id));
  };

  const exitMode = async () => {
    setIsSavingSort(true);
    try {
      if (mode === "sort-cat") {
        await Promise.all(
          localCats.map((cat, i) =>
            saveCat.mutateAsync({ id: cat.id, name: cat.name, unit: cat.unit, price: cat.price, sort: i, enabled: cat.enabled })
          )
        );
        toast.success("一级分类排序已保存");
      } else if (mode === "sort-sub" && localSubCats.length > 0) {
        await Promise.all(
          localSubCats.map((sub, i) =>
            saveCat.mutateAsync({ id: sub.id, parentId: sub.parentId, name: sub.name, unit: sub.unit, price: sub.price, sort: i, enabled: sub.enabled })
          )
        );
        toast.success("二级分类排序已保存");
      } else if (mode === "sort-prod" && localProds.length > 0) {
        await Promise.all(
          localProds.map((prod, i) =>
            saveProd.mutateAsync({ id: prod.id, categoryId: prod.categoryId ?? undefined, subcategoryId: prod.subcategoryId ?? undefined, name: prod.name, unit: prod.unit, price: prod.price, sort: i, enabled: prod.enabled })
          )
        );
        toast.success("三级分类排序已保存");
      }
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败，请重试");
    } finally {
      setIsSavingSort(false);
    }
    setSearchText("");
    setLocalCats([]);
    setLocalSubCats([]);
    setLocalProds([]);
    setSortParentCatId(null);
    setSortParentSubId(null);
    setMode("preview");
  };

  // ===== dnd-kit 传感器 =====
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith("cat-") && overId.startsWith("cat-")) {
      const activeIdx = localCats.findIndex((c) => `cat-${c.id}` === activeId);
      const overIdx = localCats.findIndex((c) => `cat-${c.id}` === overId);
      if (activeIdx === -1 || overIdx === -1) return;
      setLocalCats(arrayMove(localCats, activeIdx, overIdx));
    } else if (activeId.startsWith("sub-") && overId.startsWith("sub-")) {
      const activeIdx = localSubCats.findIndex((s) => `sub-${s.id}` === activeId);
      const overIdx = localSubCats.findIndex((s) => `sub-${s.id}` === overId);
      if (activeIdx === -1 || overIdx === -1) return;
      setLocalSubCats(arrayMove(localSubCats, activeIdx, overIdx));
    } else if (activeId.startsWith("prod-") && overId.startsWith("prod-")) {
      const activeIdx = localProds.findIndex((p) => `prod-${p.id}` === activeId);
      const overIdx = localProds.findIndex((p) => `prod-${p.id}` === overId);
      if (activeIdx === -1 || overIdx === -1) return;
      setLocalProds(arrayMove(localProds, activeIdx, overIdx));
    }
  };

  // ===== 统计 =====
  const allProds = useMemo(() => {
    const list: ProdItem[] = [];
    for (const cat of rawCategories) {
      list.push(...cat.items);
      for (const sub of cat.subCategories) list.push(...sub.items);
    }
    return list;
  }, [rawCategories]);

  // 真正的三级分类：subcategoryId 有值（挂在二级下）
  const totalCount = useMemo(() => allProds.filter((p) => p.enabled && p.subcategoryId != null).length, [allProds]);
  const disabledCount = useMemo(() => allProds.filter((p) => !p.enabled).length, [allProds]);
  const commonCount = useMemo(() => allProds.filter((p) => p.isCommon && p.enabled).length, [allProds]);

  // ===== 过滤逻辑 =====
  const filteredCategories = useMemo(() => {
    const kw = searchText.trim().toLowerCase();
    const freq = getSearchFreq();
    return sortedCategories
      .map((cat) => {
        // 过滤直接挂一级的项目
        let directItems = [...cat.items].sort((a, b) => a.sort - b.sort || a.id - b.id);
        if (!showDisabled) directItems = directItems.filter((it) => it.enabled);
        if (kw) directItems = directItems.filter((it) => it.name.toLowerCase().includes(kw));

        // 过滤二级分类及其三级分类
        const subCats = cat.subCategories
          .sort((a, b) => a.sort - b.sort || a.id - b.id)
          .map((sub) => {
            let subItems = [...sub.items].sort((a, b) => a.sort - b.sort || a.id - b.id);
            if (!showDisabled) subItems = subItems.filter((it) => it.enabled);
            if (kw) subItems = subItems.filter((it) => it.name.toLowerCase().includes(kw));
            return { ...sub, items: subItems };
          })
          .filter((sub) => (kw ? sub.items.length > 0 : true));

        return { ...cat, items: directItems, subCategories: subCats };
      })
      .filter((cat) => (kw ? cat.items.length > 0 || cat.subCategories.length > 0 : true));
  }, [sortedCategories, searchText, showDisabled, getSearchFreq]);

  // ===== 分类编辑弹层（一级/二级通用） =====
  const [catSheet, setCatSheet] = useState<{
    id?: number;
    parentId?: number | null;
    level: 1 | 2;
    name: string;
    unit: string;
    price: string;
  } | null>(null);

  const handleSaveCat = async () => {
    if (!catSheet) return;
    if (!catSheet.name.trim()) { toast.error("请输入名称"); return; }
    try {
      const totalL1 = rawCategories.length;
      const parentCat = catSheet.parentId ? rawCategories.find((c) => c.id === catSheet.parentId) : null;
      const totalL2 = parentCat ? parentCat.subCategories.length : 0;
      await saveCat.mutateAsync({
        id: catSheet.id,
        parentId: catSheet.parentId ?? null,
        name: catSheet.name.trim(),
        unit: catSheet.unit.trim(),
        price: parseFloat(catSheet.price) || 0,
        sort: catSheet.id
          ? (catSheet.level === 1
              ? (rawCategories.find((c) => c.id === catSheet.id)?.sort ?? totalL1)
              : (parentCat?.subCategories.find((s) => s.id === catSheet.id)?.sort ?? totalL2))
          : (catSheet.level === 1 ? totalL1 : totalL2),
        enabled: true,
      });
      toast.success(catSheet.id
        ? `「${catSheet.name.trim()}」已保存`
        : `已添加${catSheet.level === 1 ? "一级" : "二级"}分类「${catSheet.name.trim()}」`);
      setCatSheet(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const handleDelCatConfirm = async () => {
    if (!deleteConfirm || (deleteConfirm.type !== "cat" && deleteConfirm.type !== "subcat")) return;
    try {
      await delCat.mutateAsync({ id: deleteConfirm.id });
      toast.success(`「${deleteConfirm.name}」已删除`);
      setDeleteConfirm(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  // ===== 项目编辑弹层 =====
  const [prodSheet, setProdSheet] = useState<{
    id?: number;
    categoryId: number;
    subcategoryId?: number | null;
    name: string;
    unit: string;
    price: string;
    isCommon: boolean;
    enabled: boolean;
    _unitCustom?: boolean;
  } | null>(null);

  const UNIT_FREQ_KEY = `yaban_unit_freq_${currentTenantId}`;
  const getUnitFreq = useCallback((): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem(UNIT_FREQ_KEY) || "{}"); } catch { return {}; }
  }, [UNIT_FREQ_KEY]);
  const bumpUnitFreq = useCallback((unit: string) => {
    if (!unit || unit === "自定义") return;
    const freq = getUnitFreq();
    freq[unit] = (freq[unit] || 0) + 1;
    localStorage.setItem(UNIT_FREQ_KEY, JSON.stringify(freq));
  }, [getUnitFreq, UNIT_FREQ_KEY]);
  const BASE_UNITS = ["次","颗","支","套","天","课","题","个","边","局","序"];
  const PRESET_UNITS = useMemo(() => {
    const freq = getUnitFreq();
    return [...BASE_UNITS].sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodSheet === null]);

  const openNewProd = (categoryId: number, subcategoryId?: number | null) =>
    setProdSheet({ categoryId, subcategoryId: subcategoryId ?? null, name: "", unit: "次", price: "", isCommon: false, enabled: true } as any);
  const openEditProd = (it: ProdItem) =>
    setProdSheet({
      id: it.id, categoryId: it.categoryId || 0, subcategoryId: it.subcategoryId ?? null,
      name: it.name, unit: it.unit, price: String(it.price),
      isCommon: it.isCommon, enabled: it.enabled,
      _unitCustom: !PRESET_UNITS.includes(it.unit),
    } as any);

  const handleSaveProd = async () => {
    if (!prodSheet) return;
    if (!prodSheet.name.trim()) { toast.error("请输入项目名称"); return; }
    try {
      await saveProd.mutateAsync({
        id: prodSheet.id,
        categoryId: prodSheet.categoryId,
        subcategoryId: prodSheet.subcategoryId ?? null,
        name: prodSheet.name.trim(),
        unit: prodSheet.unit.trim() || "次",
        price: parseFloat(prodSheet.price) || 0,
        isCommon: prodSheet.isCommon,
        enabled: prodSheet.enabled,
        sort: 0,
      });
      bumpUnitFreq(prodSheet.unit.trim() || "次");
      toast.success(prodSheet.id ? `「${prodSheet.name.trim()}」已保存` : `已添加项目「${prodSheet.name.trim()}」`);
      setProdSheet(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const handleDelProdConfirm = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "prod") return;
    try {
      await delProd.mutateAsync({ id: deleteConfirm.id });
      toast.success(`项目「${deleteConfirm.name}」已删除`);
      setDeleteConfirm(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  const handleToggleCommon = async (it: ProdItem) => {
    try {
      await toggleCommon.mutateAsync({ id: it.id, isCommon: !it.isCommon });
      toast.success(it.isCommon ? "已取消常用" : "已设为常用");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  // ===== DragOverlay 标签 =====
  const activeDragLabel = useMemo(() => {
    if (!activeDragId) return "";
    if (activeDragId.startsWith("cat-")) {
      const catId = parseInt(activeDragId.replace("cat-", ""));
      return localCats.find((c) => c.id === catId)?.name ?? "";
    }
    return "";
  }, [activeDragId, localCats]);

  // ===== 渲染单个项目行（三级，靠左无缩进，虚线分隔） =====
  const renderProdRow = (it: ProdItem, seqLabel: string) => (
    <div
      key={it.id}
      className={`flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-gray-100 ${it.enabled ? "" : "opacity-50"}`}
      onDoubleClick={() => canManage && openEditProd(it)}
      onTouchEnd={(e) => {
        const now = Date.now();
        const el = e.currentTarget as HTMLElement & { _lastTap?: number };
        if (now - (el._lastTap ?? 0) < 300) {
          e.preventDefault();
          if (canManage) openEditProd(it);
        }
        el._lastTap = now;
      }}
    >
      <span className="text-[10px] text-gray-400 w-8 shrink-0 text-left tabular-nums">{seqLabel}</span>
      <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-sm text-gray-500 truncate">
          {it.name}
          {!it.enabled && <span className="text-[11px] text-gray-400 ml-1">已停用</span>}
          {it.isCommon && <Star className="inline w-3 h-3 text-yellow-400 ml-1 mb-0.5" />}
        </span>
        <PriceTag price={it.price} priceMax={it.priceMax} unit={it.unit} />
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">

      {/* ===== 顶部蓝色导航栏 ===== */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-[#2196C8] to-[#1976BA] text-white">

        {/* 行1：返回 + 标题 + 切换医院 + 添加按钮 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <button onClick={goBack} aria-label="返回" className="shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold leading-tight">收费项目库</span>
          <div className="ml-1 flex-1 min-w-0">
            <YabanClinicHeader compact className="text-white/90" />
          </div>
          {isSavingSort && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          {canManage && (
            <button
              onClick={() => navigate("/yaban/settings/charge-add")}
              className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition shrink-0"
              aria-label="添加"
            >
              <img src="/icon-add.webp" alt="" className="w-8 h-8 object-cover rounded-full" />
            </button>
          )}
        </div>

        {/* 行2：统计概览 */}
        <div className="flex items-stretch px-4 py-2 border-t border-white/10">
          <div className="flex-1 flex flex-col justify-center items-center">
            <span className="text-xl font-bold leading-none">{rawCategories.length}</span>
            <span className="text-[10px] text-white/65 mt-1">一级分类</span>
          </div>
          <div className="w-px bg-white/15 my-1" />
          <div className="flex-1 flex flex-col justify-center items-center">
            <span className="text-xl font-bold leading-none">
              {rawCategories.reduce((s, c) => s + c.subCategories.length + c.items.length, 0)}
            </span>
            <span className="text-[10px] text-white/65 mt-1">二级分类</span>
          </div>
          <div className="w-px bg-white/15 my-1" />
          <div className="flex-1 flex flex-col justify-center items-center">
            <span className="text-xl font-bold leading-none">{totalCount}</span>
            <span className="text-[10px] text-white/65 mt-1">三级分类</span>
          </div>
        </div>

      </div>

      {/* ===== 内容区 ===== */}
      <div className="max-w-lg mx-auto px-4 pt-3 space-y-3">

        {/* 搜索框 + 折叠按鈕 + 管理按鈕 */}
        <div className="flex items-center gap-2">
          {/* 搜索框（排序模式下隐藏） */}
          {mode !== "sort-cat" && mode !== "sort-sub" && mode !== "sort-prod" && (
            <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl shadow-sm px-3 h-10">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                value={searchText}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchText(val);
                  if (val.trim().length >= 2) recordSearchFreq(val.trim());
                }}
                placeholder="搜索项目名称…"
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              />
              {searchText && (
                <button onClick={() => setSearchText("")} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {/* 排序模式下显示提示文字 */}
          {(mode === "sort-cat" || mode === "sort-sub" || mode === "sort-prod") && (
            <div className="flex-1 text-xs text-gray-500 px-1">
              {mode === "sort-cat" && "拖动手柄调整一级分类顺序"}
              {mode === "sort-sub" && (sortParentCatId ? "拖动手柄调整二级分类顺序" : "请先选择一级分类")}
              {mode === "sort-prod" && (sortParentSubId ? "拖动手柄调整三级分类顺序" : sortParentCatId ? "请选择二级分类" : "请先选择一级分类")}
            </div>
          )}
          {/* 全折叠按鈕（仅 preview 模式且未搜索时显示） */}
          {mode === "preview" && !searchText && (
            <button
              onClick={() => {
                const allIds = filteredCategories.map((c) => c.id);
                const allCollapsed = allIds.every((id) => collapsedCats.has(id));
                setCollapsedCats(allCollapsed ? new Set() : new Set(allIds));
              }}
              className="shrink-0 bg-white rounded-xl shadow-sm px-3 h-10 text-xs text-gray-500 flex items-center gap-1 active:bg-gray-50"
            >
              {filteredCategories.every((c) => collapsedCats.has(c.id))
                ? <><ChevronDown className="w-3.5 h-3.5" />全展开</>
                : <><ChevronRight className="w-3.5 h-3.5" />全折叠</>}
            </button>
          )}
          {/* 管理/保存按鈕 */}
          {canManage && (
            <button
              onClick={() => {
                if (mode === "preview" || mode === "edit") setShowManagePicker(true);
                else exitMode();
              }}
              className="shrink-0 bg-white rounded-xl shadow-sm px-3 h-10 text-xs text-gray-600 flex items-center gap-1 active:bg-gray-50"
            >
              {mode === "preview" || mode === "edit" ? (
                <><Settings2 className="w-3.5 h-3.5" />管理</>
              ) : (
                <><span className="text-blue-500 font-medium">保存排序</span></>
              )}
            </button>
          )}
        </div>

        {/* 停用项目开关 */}
        {mode !== "sort-cat" && mode !== "sort-sub" && mode !== "sort-prod" && disabledCount > 0 && !searchText && (
          <button
            onClick={() => setShowDisabled((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 px-1"
          >
            {showDisabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showDisabled ? `隐藏已停用项目（${disabledCount}）` : `显示已停用项目（${disabledCount}）`}
          </button>
        )}

        {listQuery.isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-1" />
            加载中…
          </div>
        ) : (mode === "sort-cat" || mode === "sort-sub" || mode === "sort-prod") ? (
          /* ===== 排序模式：级别 Tab + 内容 ===== */
          <>
            {/* 级别选择 Tab */}
            <div className="flex bg-white rounded-2xl shadow-sm overflow-hidden">
              {(["sort-cat", "sort-sub", "sort-prod"] as const).map((m, i) => {
                const labels = ["一级分类", "二级分类", "三级分类"];
                return (
                  <button
                    key={m}
                    onClick={() => enterMode(m)}
                    className={`flex-1 py-2.5 text-xs font-medium transition ${
                      mode === m
                        ? "bg-[#1E88D6] text-white"
                        : "text-gray-500 active:bg-gray-50"
                    } ${i > 0 ? "border-l border-gray-100" : ""}`}
                  >
                    {labels[i]}
                  </button>
                );
              })}
            </div>

            {/* 一级分类排序 */}
            {mode === "sort-cat" && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={localCats.map((c) => `cat-${c.id}`)} strategy={verticalListSortingStrategy}>
                  {localCats.map((cat) => (
                    <SortableCatRow key={cat.id} cat={cat} isSaving={isSavingSort} />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeDragId && (
                    <div className="bg-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 border border-blue-200">
                      <GripVertical className="w-4 h-4 text-[#1E88D6]" />
                      <span className="text-sm font-medium text-gray-800">{activeDragLabel}</span>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}

            {/* 二级分类排序 */}
            {mode === "sort-sub" && (
              <>
                {/* 一个下拉框选一级分类 */}
                <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
                  <div className="text-xs text-gray-400 mb-2">选择一级分类，再拖动排序内部的二级分类</div>
                  <select
                    value={sortParentCatId ?? ""}
                    onChange={(e) => selectSortCat(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-gray-50 outline-none"
                  >
                    <option value=""></option>
                    {sortedCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                {sortParentCatId && (
                  localSubCats.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">该分类下暂无二级分类</div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                      <SortableContext items={localSubCats.map((s) => `sub-${s.id}`)} strategy={verticalListSortingStrategy}>
                        {localSubCats.map((sub) => <SortableSubRow key={sub.id} sub={sub} isSaving={isSavingSort} />)}
                      </SortableContext>
                      <DragOverlay>{activeDragId && <div className="bg-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 border border-blue-200"><GripVertical className="w-4 h-4 text-[#1E88D6]" /><span className="text-sm font-medium text-gray-800">{activeDragLabel}</span></div>}</DragOverlay>
                    </DndContext>
                  )
                )}
              </>
            )}

            {/* 三级分类排序 */}
            {mode === "sort-prod" && (
              <>
                {/* 两个下拉框：一级 + 二级，同时显示 */}
                <div className="bg-white rounded-2xl shadow-sm px-4 py-3 space-y-3">
                  <div className="text-xs text-gray-400">选择一级分类和二级分类，再拖动排序内部的三级分类</div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1.5">第一步：选择一级分类</div>
                    <select
                      value={sortParentCatId ?? ""}
                      onChange={(e) => selectSortCat(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-gray-50 outline-none"
                    >
                      <option value=""></option>
                      {sortedCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1.5">第二步：选择二级分类</div>
                    <select
                      value={sortParentSubId ?? ""}
                      onChange={(e) => selectSortSub(e.target.value ? Number(e.target.value) : null)}
                      disabled={!sortParentCatId}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-gray-50 outline-none disabled:opacity-40"
                    >
                      <option value=""></option>
                      {sortParentCatId && (() => {
                        const parentCat = sortedCategories.find((c) => c.id === sortParentCatId);
                        return (parentCat?.subCategories ?? []).map((sub) => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>
                {sortParentSubId && (
                  localProds.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">该二级分类下没有三级分类</div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                      <SortableContext items={localProds.map((p) => `prod-${p.id}`)} strategy={verticalListSortingStrategy}>
                        {localProds.map((prod) => <SortableProdRow key={prod.id} prod={prod} isSaving={isSavingSort} />)}
                      </SortableContext>
                      <DragOverlay>{activeDragId && <div className="bg-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 border border-blue-200"><GripVertical className="w-4 h-4 text-[#1E88D6]" /><span className="text-sm font-medium text-gray-800">{activeDragLabel}</span></div>}</DragOverlay>
                    </DndContext>
                  )
                )}
              </>
            )}
          </>

        ) : (
          /* ===== 预览/编辑模式：三级展示 ===== */
          <>
            {filteredCategories.length === 0 && searchText ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                未找到包含「{searchText}」的项目
              </div>
            ) : (
              filteredCategories.map((cat, catIdx) => {
                const isCollapsed = mode === "preview" && collapsedCats.has(cat.id) && !searchText;
                // 二级数：直接挂一级的项目（展示为二级）+ 真正的二级分类
                const level2Count = cat.items.length + cat.subCategories.length;
                // 三级数：真正挂在二级下的项目
                const level3Count = cat.subCategories.reduce((s, sub) => s + sub.items.length, 0);
                const totalItems = level2Count + level3Count;
                return (
                  <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* 一级分类头 */}
                    <div
                      className="flex items-center gap-1 px-4 py-3 border-b border-gray-50 select-none cursor-pointer active:bg-gray-50"
                      onClick={() => toggleCollapse(cat.id)}
                      onDoubleClick={() => canManage && setCatSheet({ id: cat.id, parentId: null, level: 1, name: cat.name, unit: cat.unit, price: String(cat.price) })}
                      onTouchEnd={(e) => {
                        const now = Date.now();
                        const el = e.currentTarget as HTMLElement & { _lastTap?: number };
                        if (now - (el._lastTap ?? 0) < 300) {
                          e.preventDefault();
                          if (canManage) setCatSheet({ id: cat.id, parentId: null, level: 1, name: cat.name, unit: cat.unit, price: String(cat.price) });
                        }
                        el._lastTap = now;
                      }}
                    >
                      <span className="text-[11px] font-semibold text-gray-400 w-8 text-left shrink-0">{catIdx + 1}</span>
                      <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
                      <span className="text-sm font-bold text-gray-800 ml-1 truncate">{cat.name}</span>
                      <span className="shrink-0 text-[11px] text-gray-400 font-normal ml-1 mr-1">({level2Count}/{level3Count})</span>
                      <span className="flex-1" />
                      {/* 一级本身的价格（可选） */}
                      {(cat.price > 0 || cat.unit) && (
                        <span className="shrink-0 mr-1">
                          <PriceTag price={cat.price} priceMax={cat.priceMax} unit={cat.unit} />
                        </span>
                      )}
                      {mode === "preview" && (
                        isCollapsed
                          ? <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                    </div>

                    {/* 展开内容 */}
                    {!isCollapsed && (
                      <div className="divide-y divide-gray-50">
                        {/* 直接挂一级的项目：以「二级分类」样式展示 */}
                        {cat.items.map((it, itemIdx) => (
                          <div
                            key={it.id}
                            className={`flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-gray-100 select-none ${it.enabled ? "" : "opacity-50"}`}
                            onDoubleClick={() => canManage && openEditProd(it)}
                            onTouchEnd={(e) => {
                              const now = Date.now();
                              const el = e.currentTarget as HTMLElement & { _lastTap?: number };
                              if (now - (el._lastTap ?? 0) < 300) {
                                e.preventDefault();
                                if (canManage) openEditProd(it);
                              }
                              el._lastTap = now;
                            }}
                          >
                            <span className="text-[10px] text-gray-400 w-8 shrink-0 text-left tabular-nums">{catIdx + 1}.{itemIdx + 1}</span>
                            <span className="text-sm text-gray-500 truncate flex-1">
                              {it.name}
                              {!it.enabled && <span className="text-[11px] text-gray-400 ml-1">已停用</span>}
                              {it.isCommon && <Star className="inline w-3 h-3 text-yellow-400 ml-1 mb-0.5" />}
                            </span>
                            <PriceTag price={it.price} priceMax={it.priceMax} unit={it.unit} />
                          </div>
                        ))}

                        {/* 二级分类 + 三级分类（平铺） */}
                        {cat.subCategories.map((sub, subIdx) => {
                          const subSeq = `${catIdx + 1}.${cat.items.length + subIdx + 1}`;
                          return (
                            <div key={sub.id}>
                              {/* 二级分类行：靠左对齐，虚线分隔，字色与三级相同 */}
                              <div
                                className="flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-gray-100 select-none"
                                onDoubleClick={() => canManage && setCatSheet({ id: sub.id, parentId: cat.id, level: 2, name: sub.name, unit: sub.unit, price: String(sub.price) })}
                                onTouchEnd={(e) => {
                                  const now = Date.now();
                                  const el = e.currentTarget as HTMLElement & { _lastTap?: number };
                                  if (now - (el._lastTap ?? 0) < 300) {
                                    e.preventDefault();
                                    if (canManage) setCatSheet({ id: sub.id, parentId: cat.id, level: 2, name: sub.name, unit: sub.unit, price: String(sub.price) });
                                  }
                                  el._lastTap = now;
                                }}
                              >
                                <span className="text-[10px] text-gray-400 w-8 shrink-0 text-left tabular-nums">{subSeq}</span>
                                <span className="text-sm text-gray-500 truncate flex-1">{sub.name}</span>
                                {(sub.price > 0 || sub.unit) && (
                                  <PriceTag price={sub.price} priceMax={sub.priceMax} unit={sub.unit} />
                                )}
                                <span className="text-[10px] text-gray-400 ml-1">({sub.items.length})</span>
                                {/* 编辑模式：添加三级分类 */}
                                {mode === "edit" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openNewProd(cat.id, sub.id); }}
                                    className="ml-2 text-[#1E88D6] active:text-blue-700"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {/* 三级分类（靠左平铺） */}
                              {sub.items.map((it, itemIdx) =>
                                renderProdRow(it, `${subSeq}.${itemIdx + 1}`)
                              )}
                              {/* 编辑模式：三级为空提示 */}
                              {mode === "edit" && sub.items.length === 0 && (
                                <div className="px-12 py-2 text-xs text-gray-300">暂无项目，点上方 + 添加</div>
                              )}
                            </div>
                          );
                        })}

                        {/* 编辑模式：添加直接挂一级的项目 */}
                        {mode === "edit" && (
                          <div className="flex gap-2 px-4 py-2.5 border-t border-gray-50">
                            <button
                              onClick={() => openNewProd(cat.id, null)}
                              className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-[#1E88D6] active:bg-[#F0F7FD] rounded-lg"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              添加项目（挂一级）
                            </button>
                            <button
                              onClick={() => setCatSheet({ parentId: cat.id, level: 2, name: "", unit: "", price: "" })}
                              className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-gray-500 active:bg-gray-50 rounded-lg"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              添加二级分类
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* 编辑模式：新增一级分类 */}
            {mode === "edit" && !listQuery.isLoading && !searchText && (
              <button
                onClick={() => setCatSheet({ parentId: null, level: 1, name: "", unit: "", price: "" })}
                className="w-full flex items-center justify-center gap-1 py-3 rounded-2xl bg-white text-sm font-medium text-[#1E88D6] shadow-sm active:bg-[#F0F7FD]"
              >
                <Plus className="w-4 h-4" />
                新增一级分类
              </button>
            )}
          </>
        )}
      </div>

      {/* ===== 管理操作选择弹层 ===== */}
      {showManagePicker && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setShowManagePicker(false)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-gray-800">管理收费项目</span>
              <button onClick={() => setShowManagePicker(false)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => { setShowManagePicker(false); enterMode("sort-cat"); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-blue-50 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#EBF5FB" }}>
                  <ArrowUpDown className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">调整排序顺序</div>
                  <div className="text-xs text-gray-400 mt-0.5">拖动调整一级、二级、三级的展示顺序</div>
                </div>
              </button>
              <button
                onClick={() => { setShowManagePicker(false); enterMode("edit"); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-blue-50 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#EBF5FB" }}>
                  <Pencil className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">编辑分类和项目</div>
                  <div className="text-xs text-gray-400 mt-0.5">新增/修改/删除分类和项目，双击可快速编辑</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowManagePicker(false);
                  setCopySheet({ step: "select", fromTenantId: currentTenantId, toTenantId: null, analysis: null, catActions: {}, prodActions: {}, result: null });
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-blue-50 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#EBF5FB" }}>
                  <Copy className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">复制到其他门诊</div>
                  <div className="text-xs text-gray-400 mt-0.5">将本门诊收费项目库复制到名下其他门诊</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowManagePicker(false);
                  openPriceHistory({ type: "global" });
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-blue-50 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#EBF5FB" }}>
                  <TrendingDown className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">调价记录</div>
                  <div className="text-xs text-gray-400 mt-0.5">查看本门诊所有项目的历史调价记录</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 分类编辑弹层（一级/二级通用） ===== */}
      {catSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setCatSheet(null)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-4 pb-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-gray-800">
                {catSheet.id
                  ? `编辑${catSheet.level === 1 ? "一级" : "二级"}分类`
                  : `新增${catSheet.level === 1 ? "一级" : "二级"}分类`}
              </span>
              <div className="flex items-center gap-2">
                {catSheet.id && (
                  <button
                    onClick={() => {
                      setCatSheet(null);
                      setDeleteConfirm({ type: catSheet.level === 1 ? "cat" : "subcat", id: catSheet.id!, name: catSheet.name });
                    }}
                    className="text-gray-300 active:text-red-500 p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button onClick={() => setCatSheet(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">名称</label>
              <input
                value={catSheet.name}
                onChange={(e) => setCatSheet({ ...catSheet, name: e.target.value })}
                placeholder={catSheet.level === 1 ? "如 检查诊断" : "如 X 光检查"}
                className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">价格（0=面议，可选）</label>
                <input
                  value={catSheet.price}
                  onChange={(e) => setCatSheet({ ...catSheet, price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-gray-500 mb-1">单位（可选）</label>
                <input
                  value={catSheet.unit}
                  onChange={(e) => setCatSheet({ ...catSheet, unit: e.target.value })}
                  placeholder="次"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
            {/* 分类级调价记录入口（仅编辑已有分类时显示，且分类有价格字段） */}
            {catSheet.id && (
              <button
                onClick={() => {
                  setCatSheet(null);
                  openPriceHistory({ type: "product", productId: catSheet.id, productName: catSheet.name });
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-500 active:bg-gray-100"
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  查看调价记录
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSaveCat}
              disabled={saveCat.isPending}
              className="w-full py-3 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {saveCat.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* ===== 项目编辑弹层 ===== */}
      {prodSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setProdSheet(null)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-4 pb-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-gray-800">{prodSheet.id ? "编辑项目" : "新增项目"}</span>
              <div className="flex items-center gap-2">
                {prodSheet.id && (
                  <button
                    onClick={() => { setProdSheet(null); setDeleteConfirm({ type: "prod", id: prodSheet.id!, name: prodSheet.name }); }}
                    className="text-gray-300 active:text-red-500 p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button onClick={() => setProdSheet(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">项目名称</label>
              <input
                value={prodSheet.name}
                onChange={(e) => setProdSheet({ ...prodSheet, name: e.target.value })}
                placeholder="如 树脂补牙"
                className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">单价（元，0 表示面议）</label>
              <div className="flex gap-2">
                <input
                  value={prodSheet.price}
                  onChange={(e) => setProdSheet({ ...prodSheet, price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1 bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                />
                <div className="relative shrink-0">
                  <select
                    value={(prodSheet as any)._unitCustom ? "自定义" : prodSheet.unit}
                    onChange={(e) => {
                      if (e.target.value === "自定义") {
                        setProdSheet({ ...prodSheet, unit: "", _unitCustom: true } as any);
                      } else {
                        setProdSheet({ ...prodSheet, unit: e.target.value, _unitCustom: false } as any);
                      }
                    }}
                    className="w-24 bg-gray-100 rounded-xl pl-3 pr-7 py-2.5 text-sm outline-none appearance-none"
                  >
                    {PRESET_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="自定义">自定义…</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              {(prodSheet as any)._unitCustom && (
                <input
                  value={prodSheet.unit}
                  onChange={(e) => setProdSheet({ ...prodSheet, unit: e.target.value })}
                  placeholder="输入自定义单位"
                  className="mt-2 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none"
                  autoFocus
                />
              )}
            </div>
            {/* 项目级调价记录入口（仅编辑已有项目时显示） */}
            {prodSheet.id && (
              <button
                onClick={() => {
                  openPriceHistory({ type: "product", productId: prodSheet.id, productName: prodSheet.name });
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-500 active:bg-gray-100"
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  查看调价记录
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSaveProd}
              disabled={saveProd.isPending}
              className="w-full py-3 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {saveProd.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* ===== 删除确认弹层 ===== */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-5 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <p className="text-base font-bold text-gray-800 mb-1">
                确认删除{deleteConfirm.type === "cat" ? "一级分类" : deleteConfirm.type === "subcat" ? "二级分类" : "项目"}
              </p>
              <p className="text-sm text-gray-500">
                「{deleteConfirm.name}」删除后无法恢复
                {(deleteConfirm.type === "cat" || deleteConfirm.type === "subcat") && "，该分类下的内容也将一并删除"}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-sm font-medium text-gray-600 active:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={deleteConfirm.type === "prod" ? handleDelProdConfirm : handleDelCatConfirm}
                className="flex-1 py-3 rounded-xl bg-red-500 text-sm font-medium text-white active:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 复制到其他门诊弹层 ===== */}
      {copySheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => { if (!isCopying) setCopySheet(null); }}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <span className="text-base font-bold text-gray-800">
                {copySheet.step === "select" && "复制收费项目库"}
                {copySheet.step === "analyze" && "正在分析差异..."}
                {copySheet.step === "confirm" && "确认复制内容"}
                {copySheet.step === "done" && "复制完成"}
              </span>
              {!isCopying && (
                <button onClick={() => setCopySheet(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
              )}
            </div>

            {/* 步骤1：选择来源门诊和目标门诊 */}
            {copySheet.step === "select" && (
              <div className="space-y-4 overflow-y-auto">
                <div>
                  <p className="text-xs text-gray-500 mb-2">从哪家门诊复制？</p>
                  {clinicsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                  ) : (
                    <div className="space-y-1.5">
                      {allClinics.map((c: any) => (
                        <button
                          key={c.tenantId}
                          onClick={() => setCopySheet((prev) => prev ? { ...prev, fromTenantId: c.tenantId } : prev)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                            copySheet.fromTenantId === c.tenantId
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "bg-gray-50 text-gray-700"
                          }`}
                        >
                          <span>{c.name}</span>
                          {copySheet.fromTenantId === c.tenantId && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">复制到哪家门诊？</p>
                  {clinicsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                  ) : (
                    <div className="space-y-1.5">
                      {allClinics.filter((c: any) => c.tenantId !== copySheet.fromTenantId).map((c: any) => (
                        <button
                          key={c.tenantId}
                          onClick={() => setCopySheet((prev) => prev ? { ...prev, toTenantId: c.tenantId } : prev)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                            copySheet.toTenantId === c.tenantId
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "bg-gray-50 text-gray-700"
                          }`}
                        >
                          <span>{c.name}</span>
                          {copySheet.toTenantId === c.tenantId && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                      {allClinics.filter((c: any) => c.tenantId !== copySheet.fromTenantId).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-3">您名下没有其他门诊</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  disabled={!copySheet.fromTenantId || !copySheet.toTenantId}
                  onClick={() => setCopySheet((prev) => prev ? { ...prev, step: "analyze" } : prev)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: ACCENT }}
                >
                  下一步：分析差异
                </button>
              </div>
            )}

            {/* 步骤2：分析中 */}
            {copySheet.step === "analyze" && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: ACCENT }} />
                <p className="text-sm text-gray-500">正在分析两家门诊的收费项目差异...</p>
              </div>
            )}

            {/* 步骤3：确认冲突 */}
            {copySheet.step === "confirm" && copySheet.analysis && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* 源目标提示 */}
                <div className="bg-blue-50 rounded-xl px-4 py-3 mb-3 shrink-0">
                  <p className="text-xs text-blue-600 font-medium">
                    从《{copySheet.analysis.fromName}》复制到《{copySheet.analysis.toName}》
                  </p>
                  <div className="flex gap-4 mt-1.5 text-xs text-blue-500">
                    <span>分类：新增 {copySheet.analysis.newCats} 条，冲突 {copySheet.analysis.conflictCats} 条</span>
                    <span>项目：新增 {copySheet.analysis.newProds} 条，冲突 {copySheet.analysis.conflictProds} 条</span>
                  </div>
                </div>

                {/* 冲突列表 */}
                {(copySheet.analysis.conflictCats > 0 || copySheet.analysis.conflictProds > 0) ? (
                  <div className="overflow-y-auto flex-1 space-y-2 mb-3">
                    <p className="text-xs text-gray-500 font-medium shrink-0">以下项目在目标门诊已存在，请选择处理方式：</p>
                    {copySheet.analysis.catAnalysis.filter((c: any) => c.conflict).map((c: any) => (
                      <div key={`cat-${c.id}`} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2.5">
                        <div>
                          <span className="text-xs text-amber-700 font-medium">[{c.level === 1 ? "一级" : "二级"}分类] {c.name}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setCopySheet((prev) => prev ? { ...prev, catActions: { ...prev.catActions, [String(c.id)]: "skip" } } : prev)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              copySheet.catActions[String(c.id)] === "skip" ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-500"
                            }`}
                          >跳过</button>
                          <button
                            onClick={() => setCopySheet((prev) => prev ? { ...prev, catActions: { ...prev.catActions, [String(c.id)]: "overwrite" } } : prev)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              copySheet.catActions[String(c.id)] === "overwrite" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                            }`}
                          >覆盖</button>
                        </div>
                      </div>
                    ))}
                    {copySheet.analysis.prodAnalysis.filter((p: any) => p.conflict).map((p: any) => (
                      <div key={`prod-${p.id}`} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2.5">
                        <div>
                          <span className="text-xs text-amber-700 font-medium">[项目] {p.name}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setCopySheet((prev) => prev ? { ...prev, prodActions: { ...prev.prodActions, [String(p.id)]: "skip" } } : prev)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              copySheet.prodActions[String(p.id)] === "skip" ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-500"
                            }`}
                          >跳过</button>
                          <button
                            onClick={() => setCopySheet((prev) => prev ? { ...prev, prodActions: { ...prev.prodActions, [String(p.id)]: "overwrite" } } : prev)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              copySheet.prodActions[String(p.id)] === "overwrite" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                            }`}
                          >覆盖</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-gray-400">无冲突，可直接复制</p>
                  </div>
                )}

                <button
                  disabled={isCopying}
                  onClick={handleExecuteCopy}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white shrink-0 flex items-center justify-center gap-2"
                  style={{ backgroundColor: ACCENT }}
                >
                  {isCopying ? <><Loader2 className="w-4 h-4 animate-spin" />复制中...</> : "确认复制"}
                </button>
              </div>
            )}

            {/* 步骤4：完成 */}
            {copySheet.step === "done" && copySheet.result && (
              <div className="space-y-4">
                <div className="bg-green-50 rounded-xl px-4 py-4">
                  <p className="text-sm font-semibold text-green-700 mb-3">复制完成</p>
                  <div className="space-y-1.5 text-xs text-green-600">
                    <div className="flex justify-between">
                      <span>分类新增</span>
                      <span className="font-semibold">{copySheet.result.addedCats} 条</span>
                    </div>
                    <div className="flex justify-between">
                      <span>分类覆盖</span>
                      <span className="font-semibold">{copySheet.result.overwrittenCats} 条</span>
                    </div>
                    <div className="flex justify-between">
                      <span>分类跳过</span>
                      <span className="font-semibold">{copySheet.result.skippedCats} 条</span>
                    </div>
                    <div className="border-t border-green-200 my-1" />
                    <div className="flex justify-between">
                      <span>项目新增</span>
                      <span className="font-semibold">{copySheet.result.addedProds} 条</span>
                    </div>
                    <div className="flex justify-between">
                      <span>项目覆盖</span>
                      <span className="font-semibold">{copySheet.result.overwrittenProds} 条</span>
                    </div>
                    <div className="flex justify-between">
                      <span>项目跳过</span>
                      <span className="font-semibold">{copySheet.result.skippedProds} 条</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCopySheet(null)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  完成
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 调价记录弹层（项目级 + 全局级通用） ===== */}
      {priceHistorySheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setPriceHistorySheet(null)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <span className="text-base font-bold text-gray-800">
                  {priceHistorySheet.type === "product" ? `调价记录` : `全局调价记录`}
                </span>
                {priceHistorySheet.type === "product" && priceHistorySheet.productName && (
                  <span className="ml-2 text-sm text-gray-400">「{priceHistorySheet.productName}」</span>
                )}
              </div>
              <button onClick={() => setPriceHistorySheet(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>

            {/* 内容区 */}
            <div className="overflow-y-auto flex-1">
              {priceHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : !priceHistoryRecords.length ? (
                <div className="py-12 text-center">
                  <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">暂无调价记录</p>
                  <p className="text-xs text-gray-300 mt-1">修改项目价格后会自动记录在此</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {priceHistoryRecords.map((r: any, idx: number) => {
                    const changedAt = new Date(r.changed_at);
                    const dateStr = `${changedAt.getFullYear()}-${String(changedAt.getMonth()+1).padStart(2,'0')}-${String(changedAt.getDate()).padStart(2,'0')}`;
                    const timeStr = `${String(changedAt.getHours()).padStart(2,'0')}:${String(changedAt.getMinutes()).padStart(2,'0')}`;
                    const oldP = Number(r.old_price);
                    const oldPMax = Number(r.old_price_max);
                    const newP = Number(r.new_price);
                    const newPMax = Number(r.new_price_max);
                    const fmtPrice = (p: number, pMax: number) => pMax > 0 ? `${p}~${pMax}` : `${p}`;
                    const isDown = newP < oldP || (newP === oldP && newPMax < oldPMax);
                    return (
                      <div key={r.id} className={`flex gap-3 py-3 ${idx < priceHistoryRecords.length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
                        {/* 时间线圆点 */}
                        <div className="flex flex-col items-center shrink-0 pt-0.5">
                          <div className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: isDown ? '#22c55e' : '#f97316' }} />
                          {idx < priceHistoryRecords.length - 1 && (
                            <div className="w-px flex-1 bg-gray-100 mt-1" />
                          )}
                        </div>
                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          {priceHistorySheet.type === "global" && (
                            <div className="text-xs font-medium text-gray-700 mb-0.5 truncate">{r.product_name}</div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-400 line-through">{fmtPrice(oldP, oldPMax)}元/{r.unit}</span>
                            <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className={`text-sm font-semibold ${isDown ? 'text-green-600' : 'text-orange-500'}`}>
                              {fmtPrice(newP, newPMax)}元/{r.unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{dateStr} {timeStr}</span>
                            {r.operator_name && (
                              <span className="text-xs text-gray-300">· {r.operator_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
