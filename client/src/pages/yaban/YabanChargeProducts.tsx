/**
 * 牙伴齿科管理 - 收费项目库
 * 路由：/yaban/settings/charge-products
 * 风格：蓝白风、移动端优先、lucide-react 图标、严禁 Emoji
 *
 * 交互模式（三态）：
 *  - 预览模式（默认）：只读展示，蓝色区域显示「排序」「编辑」两个按钮
 *  - 排序模式：大类和项目均可拖拽手柄上下排序，松手后批量保存
 *  - 编辑模式：可新增/修改/删除分类和项目
 */
import { useMemo, useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

const ACCENT = "#1E88D6";

// 移动端双击检测（300ms 内两次 touch 视为双击）
function useTapToEdit(onDoubleTap: () => void) {
  const lastTap = useRef<number>(0);
  return {
    onTouchEnd: (e: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        e.preventDefault();
        onDoubleTap();
      }
      lastTap.current = now;
    },
  };
}

// sort-cat: 只排大类顺序（大类折叠，仅显示大类手柄）
// sort-prod: 只排某分类内的项目（选择分类后展开）
type PageMode = "preview" | "sort-cat" | "sort-prod" | "edit";

interface ProdItem {
  id: number;
  categoryId: number | null;
  name: string;
  unit: string;
  price: number;
  isCommon: boolean;
  enabled: boolean;
  sort: number;
}
interface CatGroup {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  items: ProdItem[];
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// ===== 可拖拽分类行 =====
function SortableCatRow({
  cat,
  children,
  isSaving,
}: {
  cat: CatGroup;
  children: React.ReactNode;
  isSaving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat-${cat.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 分类头 */}
      <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-50 select-none">
        <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
        <span className="text-sm font-bold text-gray-800 flex-1 ml-1 truncate">{cat.name}</span>
        <span className="text-xs text-gray-400 shrink-0 mr-1">{cat.items.length} 项</span>
        {/* 拖拽手柄 */}
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
      {/* 子项目列表 */}
      {children}
    </div>
  );
}

// ===== 可拖拽项目行 =====
function SortableProdRow({
  it,
  cat,
  isSaving,
}: {
  it: ProdItem;
  cat: CatGroup;
  isSaving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `prod-${cat.id}-${it.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-4 py-3 bg-white ${it.enabled ? "" : "opacity-50"}`}
    >
      {/* 项目名 + 价格（横向） */}
      <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-800 truncate">
          {it.name}
          {!it.enabled && <span className="text-[11px] text-gray-400 ml-1">已停用</span>}
        </span>
        <span className="shrink-0 text-xs">
          {it.price > 0
            ? <span className="text-gray-400">{money(it.price)} / {it.unit}</span>
            : <span className="text-orange-400">面议 / {it.unit}</span>
          }
        </span>
      </span>
      {/* 拖拽手柄 */}
      <button
        {...attributes}
        {...listeners}
        className={`p-2 rounded-lg touch-none shrink-0 ${isSaving ? "text-gray-200" : "text-gray-400 active:text-[#1E88D6] active:bg-blue-50"}`}
        aria-label="拖拽排序"
        style={{ touchAction: "none" }}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GripVertical className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function YabanChargeProducts() {
  const goBack = useSmartBack("/yaban/profile");
  const [, navigate] = useLocation();
  const { currentTenantId, current: currentClinic } = useYabanClinic();
  const clinicName = currentClinic?.name || "当前门诊";
  const { user } = useAuth();
  const { data: membership } = trpc.yabanRole.myMembership.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { refetchOnWindowFocus: false }
  );
  const perms: string[] = membership?.permissions || [];
  const isSuper = user?.role === "super_admin" || !!membership?.isFounder;
  const canManage = isSuper || perms.includes("finance");

  const utils = trpc.useUtils();
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

  const refresh = () => utils.yabanCustomer.listChargeProducts.invalidate();

  // ===== 页面模式 =====
  const [mode, setMode] = useState<PageMode>("preview");
  // 管理操作选择弹层（排序+编辑合并）
  const [showManagePicker, setShowManagePicker] = useState(false);

  // ===== 排序模式本地快照 =====
  const [localCats, setLocalCats] = useState<CatGroup[]>([]);
  const [localItems, setLocalItems] = useState<Record<number, ProdItem[]>>({});
  const [isSavingSort, setIsSavingSort] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // sort-prod 模式：当前展开排序的分类 id（null = 未选择）
  const [sortProdCatId, setSortProdCatId] = useState<number | null>(null);

  // ===== 搜索（仅预览/编辑模式） =====
  const [searchText, setSearchText] = useState("");

  // 搜索频率记录（localStorage）
  const SEARCH_FREQ_KEY = `yaban_charge_search_freq_${currentTenantId}`;
  const getSearchFreq = useCallback((): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem(SEARCH_FREQ_KEY) || "{}"); } catch { return {}; }
  }, [SEARCH_FREQ_KEY]);
  const recordSearchFreq = useCallback((name: string) => {
    const freq = getSearchFreq();
    freq[name] = (freq[name] || 0) + 1;
    localStorage.setItem(SEARCH_FREQ_KEY, JSON.stringify(freq));
  }, [getSearchFreq, SEARCH_FREQ_KEY]);

  // ===== 分类折叠（仅预览模式） =====
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
    type: "cat" | "prod";
    id: number;
    name: string;
  } | null>(null);

  // ===== 分类排序（原始顺序） =====
  const sortedCategories = useMemo(
    () => [...rawCategories].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [rawCategories]
  );

  // ===== 模式切换 =====
  const enterMode = (m: PageMode) => {
    setSearchText("");
    const cats = [...sortedCategories];
    if (m === "sort-cat") {
      setLocalCats(cats.map((c, i) => ({ ...c, sort: i })));
    }
    if (m === "sort-prod") {
      const items: Record<number, ProdItem[]> = {};
      cats.forEach((cat) => {
        const sorted = [...cat.items].sort((a, b) => a.sort - b.sort || a.id - b.id);
        items[cat.id] = sorted.map((it, idx) => ({ ...it, sort: idx }));
      });
      setLocalItems(items);
      setSortProdCatId(null); // 先不展开任何分类
    }
    setMode(m);
  };

  const exitMode = async () => {
    setIsSavingSort(true);
    try {
      if (mode === "sort-cat") {
        await Promise.all(
          localCats.map((cat) =>
            saveCat.mutateAsync({ id: cat.id, name: cat.name, sort: cat.sort, enabled: cat.enabled })
          )
        );
        toast.success("大类排序已保存");
      } else if (mode === "sort-prod") {
        const allProds = Object.values(localItems).flat();
        await Promise.all(
          allProds.map((it) =>
            saveProd.mutateAsync({
              id: it.id, categoryId: it.categoryId ?? 0,
              name: it.name, unit: it.unit, price: it.price,
              isCommon: it.isCommon, enabled: it.enabled, sort: it.sort,
            })
          )
        );
        toast.success("项目排序已保存");
      }
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败，请重试");
    } finally {
      setIsSavingSort(false);
    }
    setSearchText("");
    setLocalCats([]);
    setLocalItems({});
    setSortProdCatId(null);
    setMode("preview");
  };

  // ===== dnd-kit 传感器 =====
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // ===== 拖拽事件处理 =====
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 大类拖拽（sort-cat 模式）
    if (activeId.startsWith("cat-") && overId.startsWith("cat-")) {
      const activeIdx = localCats.findIndex((c) => `cat-${c.id}` === activeId);
      const overIdx = localCats.findIndex((c) => `cat-${c.id}` === overId);
      if (activeIdx === -1 || overIdx === -1) return;
      const newCats = arrayMove(localCats, activeIdx, overIdx).map((c, i) => ({ ...c, sort: i }));
      setLocalCats(newCats);
      return;
    }

    // 项目拖拽（sort-prod 模式，同分类内）
    const prodMatch = activeId.match(/^prod-(\d+)-(\d+)$/);
    const overMatch = overId.match(/^prod-(\d+)-(\d+)$/);
    if (!prodMatch || !overMatch) return;
    const catId = parseInt(prodMatch[1]);
    if (parseInt(overMatch[1]) !== catId) return;

    const items = localItems[catId];
    if (!items) return;
    const activeItemIdx = items.findIndex((it) => `prod-${catId}-${it.id}` === activeId);
    const overItemIdx = items.findIndex((it) => `prod-${catId}-${it.id}` === overId);
    if (activeItemIdx === -1 || overItemIdx === -1) return;

    const newItems = arrayMove(items, activeItemIdx, overItemIdx).map((it, i) => ({ ...it, sort: i }));
    setLocalItems((prev) => ({ ...prev, [catId]: newItems }));
  };

  // ===== 分类编辑弹层 =====
  const [catSheet, setCatSheet] = useState<{ id?: number; name: string } | null>(null);
  const handleSaveCat = async () => {
    if (!catSheet) return;
    if (!catSheet.name.trim()) { toast.error("请输入分类名称"); return; }
    try {
      await saveCat.mutateAsync({
        id: catSheet.id,
        name: catSheet.name.trim(),
        sort: catSheet.id
          ? (rawCategories.find((c) => c.id === catSheet.id)?.sort ?? rawCategories.length)
          : rawCategories.length,
        enabled: true,
      });
      toast.success(catSheet.id
        ? `《${clinicName}》分类「${catSheet.name.trim()}」已保存`
        : `《${clinicName}》已添加分类「${catSheet.name.trim()}」`);
      setCatSheet(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const handleDelCatConfirm = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "cat") return;
    try {
      await delCat.mutateAsync({ id: deleteConfirm.id });
      toast.success(`《${clinicName}》分类「${deleteConfirm.name}」已删除`);
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
    name: string;
    unit: string;
    price: string;
    isCommon: boolean;
    enabled: boolean;
  } | null>(null);

  // 单位使用频率记忆（localStorage）
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
  }, [prodSheet === null]); // 每次关闭弹层后重新排序
  const openNewProd = (categoryId: number) =>
    setProdSheet({ categoryId, name: "", unit: "次", price: "", isCommon: false, enabled: true } as any);
  const openEditProd = (it: ProdItem) =>
    setProdSheet({
      id: it.id, categoryId: it.categoryId || 0,
      name: it.name, unit: it.unit, price: String(it.price),
      isCommon: it.isCommon, enabled: it.enabled,
      _unitCustom: !PRESET_UNITS.includes(it.unit),
    } as any);

  const handleSaveProd = async () => {
    if (!prodSheet) return;
    if (!prodSheet.name.trim()) { toast.error("请输入项目名称"); return; }
    try {
      await saveProd.mutateAsync({
        id: prodSheet.id, categoryId: prodSheet.categoryId,
        name: prodSheet.name.trim(), unit: prodSheet.unit.trim() || "次",
        price: parseFloat(prodSheet.price) || 0,
        isCommon: prodSheet.isCommon, enabled: prodSheet.enabled, sort: 0,
      });
      bumpUnitFreq(prodSheet.unit.trim() || "次");
      toast.success(prodSheet.id
        ? `《${clinicName}》「${prodSheet.name.trim()}」已保存`
        : `《${clinicName}》已添加项目「${prodSheet.name.trim()}」`);
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
      toast.success(`《${clinicName}》项目「${deleteConfirm.name}」已删除`);
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

  // ===== 过滤逻辑（预览/编辑模式） =====
  const filteredCategories = useMemo(() => {
    const kw = searchText.trim().toLowerCase();
    const freq = getSearchFreq();
    return sortedCategories
      .map((cat) => {
        let items = [...cat.items].sort((a, b) => a.sort - b.sort || a.id - b.id);
        if (!showDisabled) items = items.filter((it) => it.enabled);
        if (kw) {
          items = items.filter((it) => it.name.toLowerCase().includes(kw));
          // 按搜索频率降序排列
          items = items.sort((a, b) => (freq[b.name] || 0) - (freq[a.name] || 0));
        }
        return { ...cat, items };
      })
      .filter((cat) => (kw ? cat.items.length > 0 : true));
  }, [sortedCategories, searchText, showDisabled, getSearchFreq]);

  const totalCount = useMemo(
    () => rawCategories.reduce((s, c) => s + c.items.filter((it) => it.enabled).length, 0),
    [rawCategories]
  );
  const disabledCount = useMemo(
    () => rawCategories.reduce((s, c) => s + c.items.filter((it) => !it.enabled).length, 0),
    [rawCategories]
  );

  // 排序模式下用于 DragOverlay 显示的项目名
  const activeDragLabel = useMemo(() => {
    if (!activeDragId) return "";
    if (activeDragId.startsWith("cat-")) {
      const catId = parseInt(activeDragId.replace("cat-", ""));
      return localCats.find((c) => c.id === catId)?.name ?? "";
    }
    const m = activeDragId.match(/^prod-(\d+)-(\d+)$/);
    if (m) {
      const [, catId, prodId] = m.map(Number);
      return localItems[catId]?.find((it) => it.id === prodId)?.name ?? "";
    }
    return "";
  }, [activeDragId, localCats, localItems]);

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">

      {/* ===== 顶部蓝色导航栏 ===== */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-[#2196C8] to-[#1976BA] text-white">

        {/* 行1：返回 + 标题 + 切换医院 + 完成（非预览模式） */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <button onClick={goBack} aria-label="返回" className="shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold leading-tight">收费项目库</span>
          <div className="ml-1 flex-1 min-w-0">
            <YabanClinicHeader compact className="text-white/90" />
          </div>
          {isSavingSort && (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          )}
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
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className="text-xl font-bold leading-none">{rawCategories.length}</span>
            <span className="text-[10px] text-white/65 mt-1">大类</span>
          </div>
          <div className="w-px bg-white/15 my-1" />
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className="text-xl font-bold leading-none">{totalCount}</span>
            <span className="text-[10px] text-white/65 mt-1">启用项目</span>
          </div>
          <div className="w-px bg-white/15 my-1" />
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className="text-xl font-bold leading-none">
              {rawCategories.reduce((s, c) => s + c.items.filter((it) => it.isCommon).length, 0)}
            </span>
            <span className="text-[10px] text-white/65 mt-1">常用</span>
          </div>
          <div className="w-px bg-white/15 my-1" />
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className={`text-xl font-bold leading-none ${disabledCount > 0 ? "text-yellow-200" : ""}`}>
              {disabledCount}
            </span>
            <span className="text-[10px] text-white/65 mt-1">已停用</span>
          </div>
        </div>

        {/* 行3：操作按钮（所有模式+有权限） */}
        {canManage && (
          <div className="px-4 pb-3 pt-1">
            <button
              onClick={() => {
                if (mode === "preview") setShowManagePicker(true);
                else exitMode();
              }}
              className="w-full flex flex-col items-center justify-center bg-white/15 active:bg-white/25 rounded-xl py-2 text-xs font-medium"
            >
              {(mode === "preview" || mode === "edit") ? (
                <span className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" />管理</span>
              ) : (
                <>
                  <span className="text-white/60 text-[10px] font-normal mb-0.5">
                    {mode === "sort-cat" && "拖动手柄调整大类顺序"}
                    {mode === "sort-prod" && (sortProdCatId ? "拖动手柄调整项目顺序" : "点分类名展开后可拖动排序")}
                  </span>
                  <span>排序完成，点此保存</span>
                </>
              )}
            </button>
          </div>
        )}


      </div>

      {/* ===== 内容区 ===== */}
      <div className="max-w-lg mx-auto px-4 pt-3 space-y-3">

        {/* 搜索框 + 一键折叠/展开（预览/编辑模式） */}
        {mode !== "sort" && (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl shadow-sm px-3 py-2.5">
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
            {/* 一键折叠/展开全部（预览模式且无搜索时显示） */}
            {mode === "preview" && !searchText && (
              <button
                onClick={() => {
                  const allIds = filteredCategories.map((c) => c.id);
                  const allCollapsed = allIds.every((id) => collapsedCats.has(id));
                  if (allCollapsed) {
                    setCollapsedCats(new Set());
                  } else {
                    setCollapsedCats(new Set(allIds));
                  }
                }}
                className="shrink-0 bg-white rounded-xl shadow-sm px-3 py-2.5 text-xs text-gray-500 flex items-center gap-1 active:bg-gray-50"
              >
                {filteredCategories.every((c) => collapsedCats.has(c.id))
                  ? <><ChevronDown className="w-3.5 h-3.5" />全展开</>
                  : <><ChevronRight className="w-3.5 h-3.5" />全折叠</>}
              </button>
            )}
          </div>
        )}

        {/* 停用项目开关 */}
        {mode !== "sort" && disabledCount > 0 && !searchText && (
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
        ) : mode === "sort-cat" ? (
          /* ===== 排大类模式：只显示大类，全部折叠 ===== */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={localCats.map((c) => `cat-${c.id}`)} strategy={verticalListSortingStrategy}>
              {localCats.map((cat) => (
                <SortableCatRow key={cat.id} cat={cat} isSaving={isSavingSort}>
                  {/* 折叠：不渲染子项目 */}
                  <div />
                </SortableCatRow>
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
        ) : mode === "sort-prod" ? (
          /* ===== 排项目模式：点击分类展开，展开后可拖拽项目 ===== */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-3">
              {localCats.map((cat) => {
                const isOpen = sortProdCatId === cat.id;
                const items = localItems[cat.id] ?? [];
                return (
                  <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* 分类头：点击展开/折叠 */}
                    <button
                      className="w-full flex items-center gap-1 px-4 py-3 select-none active:bg-gray-50"
                      onClick={() => setSortProdCatId(isOpen ? null : cat.id)}
                    >
                      <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
                      <span className="text-sm font-bold text-gray-800 flex-1 ml-1 text-left truncate">{cat.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 mr-1">{items.length} 项</span>
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-[#1E88D6] shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                    </button>
                    {/* 展开后：项目拖拽排序 */}
                    {isOpen && (
                      <SortableContext
                        items={items.map((it) => `prod-${cat.id}-${it.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="divide-y divide-gray-50 border-t border-gray-50">
                          {items.length === 0 && (
                            <div className="px-4 py-4 text-xs text-gray-300">该分类暂无项目</div>
                          )}
                          {items.map((it) => (
                            <SortableProdRow key={it.id} it={it} cat={cat} isSaving={isSavingSort} />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>
                );
              })}
            </div>
            <DragOverlay>
              {activeDragId && (
                <div className="bg-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 border border-blue-200">
                  <GripVertical className="w-4 h-4 text-[#1E88D6]" />
                  <span className="text-sm font-medium text-gray-800">{activeDragLabel}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          /* ===== 预览/编辑模式 ===== */
          <>
            {filteredCategories.length === 0 && searchText ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                未找到包含「{searchText}」的项目
              </div>
            ) : (
              filteredCategories.map((cat, catIdx) => {
                const isCollapsed = mode === "preview" && collapsedCats.has(cat.id) && !searchText;
                return (
                  <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* 分类头 */}
                    <div
                      className="flex items-center gap-1 px-4 py-3 border-b border-gray-50 select-none cursor-pointer active:bg-gray-50"
                      onClick={() => toggleCollapse(cat.id)}
                      onDoubleClick={() => canManage && setCatSheet({ id: cat.id, name: cat.name })}
                      onTouchEnd={(e) => {
                        const now = Date.now();
                        const el = e.currentTarget as HTMLElement & { _lastTap?: number };
                        if (now - (el._lastTap ?? 0) < 300) {
                          e.preventDefault();
                          if (canManage) setCatSheet({ id: cat.id, name: cat.name });
                        }
                        el._lastTap = now;
                      }}
                    >
                      <span className="text-[11px] font-semibold text-gray-400 w-4 text-center shrink-0">{catIdx + 1}</span>
                      <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
                      <span className="text-sm font-bold text-gray-800 ml-1 truncate">{cat.name}</span>
                      <span className="ml-1.5 shrink-0 text-[11px] text-gray-400 font-normal">({cat.items.length})</span>
                      <span className="flex-1" />

                      {/* 预览模式：折叠箭头 */}
                      {mode === "preview" && (
                        isCollapsed
                          ? <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
                          : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
                      )}
                    </div>

                    {/* 项目列表 */}
                    {!isCollapsed && (
                      <>
                        <div className="divide-y divide-gray-50">
                          {cat.items.length === 0 && (
                            <div className="px-4 py-4 text-xs text-gray-300">该分类暂无项目</div>
                          )}
                          {cat.items.map((it, itemIdx) => (
                            <div
                              key={it.id}
                              className={`flex items-center gap-2 px-4 py-3 ${it.enabled ? "" : "opacity-50"}`}
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
                              {/* 序号 */}
                              <span className="text-[10px] text-gray-300 w-6 shrink-0 text-right tabular-nums">{catIdx + 1}.{itemIdx + 1}</span>

                              {/* 项目名 + 价格（横向） */}
                              <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-800 truncate">
                                  {it.name}
                                  {!it.enabled && <span className="text-[11px] text-gray-400 ml-1">已停用</span>}
                                </span>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                  {it.price > 0
                                    ? <span className="text-gray-700">{money(it.price)}<span className="text-xs font-normal text-gray-400"> / {it.unit}</span></span>
                                    : <span className="text-orange-400">面议<span className="text-xs font-normal"> / {it.unit}</span></span>
                                  }
                                </span>
                              </span>

                            </div>
                          ))}
                        </div>
                        {/* 编辑模式：添加项目 */}
                        {mode === "edit" && (
                          <button
                            onClick={() => openNewProd(cat.id)}
                            className="w-full flex items-center justify-center gap-1 py-2.5 text-sm text-[#1E88D6] active:bg-[#F0F7FD]"
                          >
                            <Plus className="w-4 h-4" />
                            添加项目
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
            {/* 编辑模式：新增分类 */}
            {mode === "edit" && !listQuery.isLoading && !searchText && (
              <button
                onClick={() => setCatSheet({ name: "" })}
                className="w-full flex items-center justify-center gap-1 py-3 rounded-2xl bg-white text-sm font-medium text-[#1E88D6] shadow-sm active:bg-[#F0F7FD]"
              >
                <Plus className="w-4 h-4" />
                新增分类
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
                  <div className="text-sm font-semibold text-gray-800">排大类顺序</div>
                  <div className="text-xs text-gray-400 mt-0.5">拖动调整各大分类的展示顺序</div>
                </div>
              </button>
              <button
                onClick={() => { setShowManagePicker(false); enterMode("sort-prod"); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-blue-50 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#EBF5FB" }}>
                  <Layers className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">排项目顺序</div>
                  <div className="text-xs text-gray-400 mt-0.5">选择分类后拖动调整内部项目顺序</div>
                </div>
              </button>


            </div>
          </div>
        </div>
      )}

      {/* ===== 分类编辑弹层 ===== */}
      {catSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setCatSheet(null)}>
          <div className="mt-auto bg-white rounded-t-3xl px-4 pt-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">{catSheet.id ? "编辑分类" : "新增分类"}</span>
              <div className="flex items-center gap-2">
                {catSheet.id && (
                  <button
                    onClick={() => { setCatSheet(null); setDeleteConfirm({ type: "cat", id: catSheet.id!, name: catSheet.name }); }}
                    className="text-gray-300 active:text-red-500 p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button onClick={() => setCatSheet(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <input
              value={catSheet.name}
              onChange={(e) => setCatSheet({ ...catSheet, name: e.target.value })}
              placeholder="分类名称，如 补牙修复"
              className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none mb-4"
              autoFocus
            />
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
                {/* 编辑已有项目时显示删除按钮 */}
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
                确认删除{deleteConfirm.type === "cat" ? "分类" : "项目"}
              </p>
              <p className="text-sm text-gray-500">
                「{deleteConfirm.name}」删除后无法恢复
                {deleteConfirm.type === "cat" && "，该分类下的项目也将一并删除"}
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
                onClick={deleteConfirm.type === "cat" ? handleDelCatConfirm : handleDelProdConfirm}
                className="flex-1 py-3 rounded-xl bg-red-500 text-sm font-medium text-white active:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
