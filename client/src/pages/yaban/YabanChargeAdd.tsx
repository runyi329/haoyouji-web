/**
 * 牙伴齿科管理 - 添加收费内容（三级结构）
 * 路由：/yaban/settings/charge-add
 * 功能：3个Tab
 *   - 添加一级分类
 *   - 添加二级分类（需选择所属一级）
 *   - 添加三级项目（需选择所属一级 + 二级，或直接挂一级）
 * 分类名/项目名均支持 AI 搜索（全平台行业库）
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, Layers, Plus, Loader2, ChevronDown, Trash2, Search, X, Check, ChevronUp } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

const ACCENT = "#1E88D6";
const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";
const PRESET_UNITS = ["次", "颗", "支", "套", "天", "课", "题", "个", "边", "局", "序", "疗程", "张", "片", "节", "期", "口", "牙", "侧", "段"];

// 每行5个，显示4行 = 20个，最后一格留给"更多"按钮
const VISIBLE_UNIT_COUNT = 50;

interface SubCatGroup {
  id: number;
  parentId: number;
  name: string;
  sort: number;
  enabled: boolean;
}

interface CatGroup {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  subCategories: SubCatGroup[];
}

interface ProdRow {
  id: string;
  name: string;
  price: string;
  priceMax: string;
  priceMode: "fixed" | "range";
  unit: string;
  unitCustom: boolean;
}

type TabType = "cat1" | "cat2" | "cat3";

let rowSeq = 0;
const newRow = (): ProdRow => ({
  id: `r${++rowSeq}`,
  name: "",
  price: "",
  priceMax: "",
  priceMode: "fixed",
  unit: "次",
  unitCustom: false,
});

// 库总数独立组件，无条件查询
function useChargeLibTotal() {
  const { data } = trpc.yabanCustomer.searchChargeLib.useQuery(
    { query: "", type: "product" },
    { staleTime: 30000 }
  );
  return data?.total ?? 0;
}

// ===== AI 搜索输入框组件 =====
function AiSearchInput({
  value,
  onChange,
  placeholder,
  searchType = "product",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchType?: "category" | "product" | "all";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => { setQuery(value); }, [value]);

  const handleInput = (v: string) => {
    setQuery(v);
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(v), 200);
    setOpen(true);
  };

  const { data: libData } = trpc.yabanCustomer.searchChargeLib.useQuery(
    { query: debouncedQuery, type: searchType },
    { enabled: open, staleTime: 5000 }
  );
  const suggestions = libData?.items ?? [];
  const displayTotal = useChargeLibTotal();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center bg-gray-100 rounded-md px-3 py-3 gap-2">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { setDebouncedQuery(query); setOpen(true); }}
          placeholder={displayTotal > 0 ? `AI 搜索 · 牙伴库 ${displayTotal} 条，或自定义` : (placeholder || "AI 搜索")}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); setDebouncedQuery(""); setOpen(false); }}
            className="shrink-0 text-gray-300 active:text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      {open && suggestions.length > 0 && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-full bg-white rounded-md shadow-lg ring-1 ring-black/5 overflow-hidden max-h-52 overflow-y-auto">
            {suggestions.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => { setQuery(opt); onChange(opt); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-sm active:bg-blue-50 flex items-center gap-2 ${i > 0 ? "border-t border-gray-50" : ""}`}
                style={value === opt ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
              >
                <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ===== 单位选择器组件 =====
interface UnitPickerProps {
  value: string;
  onChange: (unit: string) => void;
  myUnits: string[];          // 我的单位库（全部，按加入顺序）
  onSaveUnits: (units: string[]) => void;  // 保存单位库
}

function UnitPicker({ value, onChange, myUnits, onSaveUnits }: UnitPickerProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [customInput, setCustomInput] = useState("");
  // 面板内临时编辑状态（未保存前不影响首页）
  const [draftUnits, setDraftUnits] = useState<string[]>(myUnits);

  const moveUnit = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= draftUnits.length) return;
    setDraftUnits((prev) => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  // 打开面板时重置草稿
  const openPanel = () => {
    setDraftUnits([...myUnits]);
    setCustomInput("");
    setShowPanel(true);
  };

  const MAX_UNITS = VISIBLE_UNIT_COUNT; // 最多19个

  const handleAddToDraft = () => {
    const u = customInput.trim();
    if (!u || draftUnits.includes(u) || draftUnits.length >= MAX_UNITS) return;
    setDraftUnits((prev) => [...prev, u]);
    setCustomInput("");
  };

  const handleRemoveFromDraft = (u: string) => {
    setDraftUnits((prev) => prev.filter((x) => x !== u));
  };

  const handleSave = () => {
    onSaveUnits(draftUnits);
    // 如果当前选中的单位被删了，清空选中
    if (value && !draftUnits.includes(value)) onChange("");
    setShowPanel(false);
  };

  // 首页最多显示20个，超出的在"更多"面板里选
  const visibleUnits = myUnits.slice(0, VISIBLE_UNIT_COUNT);
  const hasMore = myUnits.length > VISIBLE_UNIT_COUNT;

  return (
    <>
      <div>
        <span className="text-xs text-gray-400 block mb-1.5">单位：</span>
        {/* 4行 × 5列 grid */}
        <div className="grid grid-cols-5 gap-1.5">
          {visibleUnits.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onChange(u)}
              className={`py-2 rounded-md text-xs font-medium transition-colors ${
                value === u
                  ? "text-white"
                  : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
              style={value === u ? { backgroundColor: ACCENT } : {}}
            >
              {u}
            </button>
          ))}
          {/* 更多按钮：库里超过20个时显示，或者始终显示用于管理 */}
          <button
            type="button"
            onClick={openPanel}
            className="py-2 rounded-md text-xs font-medium bg-gray-100 text-gray-400 active:bg-gray-200 flex items-center justify-center gap-0.5"
          >
            {hasMore ? "更多" : "+"}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
        {/* 当前选中的单位不在前20个时，显示提示 */}
        {value && !visibleUnits.includes(value) && (
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-xs text-gray-400">已选：</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: ACCENT }}>{value}</span>
          </div>
        )}
      </div>

      {/* 单位库管理面板（全屏） */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* 顶部导航栏 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button type="button" onClick={() => setShowPanel(false)} className="text-gray-400 p-1 -ml-1">
              <X className="w-6 h-6" />
            </button>
            <span className="text-lg font-semibold text-gray-800">单位库管理</span>
            <div className="w-8" />
          </div>

          {/* 添加新单位输入框 */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddToDraft()}
                  placeholder="输入新单位，如：牙弓、疗程"
                  className="w-full bg-gray-100 rounded-md px-4 py-3 text-base outline-none"
                  style={{
                    paddingRight: (customInput.trim() && draftUnits.includes(customInput.trim())) || draftUnits.length >= MAX_UNITS ? '80px' : '16px'
                  }}
                />
                {customInput.trim() && draftUnits.includes(customInput.trim()) && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-500 font-medium whitespace-nowrap pointer-events-none">已存在</span>
                )}
                {!(customInput.trim() && draftUnits.includes(customInput.trim())) && draftUnits.length >= MAX_UNITS && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-500 font-medium whitespace-nowrap pointer-events-none">已达上限</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddToDraft}
                disabled={!customInput.trim() || draftUnits.includes(customInput.trim()) || draftUnits.length >= MAX_UNITS}
                className="px-5 py-3 rounded-md text-white text-base font-medium disabled:opacity-40"
                style={{ backgroundColor: ACCENT }}
              >
                添加
              </button>
            </div>
            <p className="text-sm font-medium mt-2" style={{ color: ACCENT }}>点击选择 · 长按拖动排序 · 右上角 × 删除（{draftUnits.length}/{MAX_UNITS}）</p>
          </div>

          {/* 单位库列表（可拖拽排序 + 删除） */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {draftUnits.length === 0 && (
              <p className="text-base text-gray-300 text-center py-12">暂无单位，请在上方添加</p>
            )}
            <div className="divide-y divide-gray-100">
              {draftUnits.map((u, idx) => (
                <div key={u} className="flex items-center gap-3 py-3">
                  {/* 单位名称（点击选中，不关闭面板） */}
                  <button
                    type="button"
                    onClick={() => onChange(u)}
                    className={`flex-1 text-left px-4 py-3 rounded-md text-base font-medium transition-colors ${
                      value === u ? "text-white" : "bg-gray-100 text-gray-700"
                    }`}
                    style={value === u ? { backgroundColor: ACCENT } : {}}
                  >
                    {u}
                  </button>
                  {/* 上移 */}
                  <button
                    type="button"
                    onClick={() => moveUnit(idx, -1)}
                    disabled={idx === 0}
                    className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center disabled:opacity-30 active:bg-gray-200"
                  >
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  </button>
                  {/* 下移 */}
                  <button
                    type="button"
                    onClick={() => moveUnit(idx, 1)}
                    disabled={idx === draftUnits.length - 1}
                    className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center disabled:opacity-30 active:bg-gray-200"
                  >
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  </button>
                  {/* 删除 */}
                  <button
                    type="button"
                    onClick={() => handleRemoveFromDraft(u)}
                    className="w-10 h-10 rounded-md bg-red-50 flex items-center justify-center active:bg-red-100"
                  >
                    <X className="w-5 h-5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="px-5 py-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-4 rounded text-white text-base font-semibold"
              style={{ backgroundColor: ACCENT }}
            >
              保存单位库
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ===== 主页面 =====
export default function YabanChargeAdd() {
  const goBack = useSmartBack("/yaban/settings/charge-products");
  const { currentTenantId, current: currentClinic } = useYabanClinic();
  const clinicName = currentClinic?.name || "当前门诊";

  const [tab, setTab] = useState<TabType>("cat1");

  const utils = trpc.useUtils();
  const listQuery = trpc.yabanCustomer.listChargeProducts.useQuery(
    { includeDisabled: false },
    { refetchOnWindowFocus: false }
  );
  const rawCategories: CatGroup[] = (listQuery.data?.categories as CatGroup[]) || [];
  const sortedCats = useMemo(
    () => [...rawCategories].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [rawCategories]
  );

  const saveCat = trpc.yabanCustomer.saveChargeCategory.useMutation();
  const saveProd = trpc.yabanCustomer.saveChargeProduct.useMutation();
  const seedLib = trpc.yabanCustomer.seedChargeLib.useMutation();
  const migrateMut = trpc.yabanCustomer.migrateProductsToSubcategories.useMutation();
  const [isMigrating, setIsMigrating] = useState(false);
  const refresh = () => utils.yabanCustomer.listChargeProducts.invalidate();

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const res = await migrateMut.mutateAsync();
      await refresh();
      toast.success(`迁移完成！${res.migrated} 个项目已转为二级分类`);
    } catch (e: any) {
      toast.error(e.message || "迁移失败");
    } finally {
      setIsMigrating(false);
    }
  };

  // 首次加载时自动将现有数据导入行业库
  useEffect(() => {
    const KEY = "yaban_charge_lib_seeded_v1";
    if (!localStorage.getItem(KEY)) {
      seedLib.mutate(undefined, {
        onSuccess: () => {
          localStorage.setItem(KEY, "1");
          utils.yabanCustomer.searchChargeLib.invalidate();
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 单位库管理（localStorage 持久化，支持添加/删除）
  const UNIT_STORE_KEY = `yaban_my_units_${currentTenantId}`;

  const [myUnits, setMyUnits] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`yaban_my_units_${currentTenantId}`);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return [...PRESET_UNITS];
  });

  const handleSaveUnits = (units: string[]) => {
    setMyUnits(units);
    localStorage.setItem(UNIT_STORE_KEY, JSON.stringify(units));
  };

  // 将使用过的单位自动加入单位库（如果不存在则追加）
  const bumpUnit = (unit: string) => {
    if (!unit || unit === "自定义") return;
    setMyUnits((prev) => {
      if (prev.includes(unit)) return prev;
      const next = [...prev, unit];
      localStorage.setItem(UNIT_STORE_KEY, JSON.stringify(next));
      return next;
    });
  };

  // ===== Tab1：批量添加一级分类 =====
  let cat1RowSeq = 0;
  const newCat1Row = () => ({ id: `c1${++cat1RowSeq}`, name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" as "fixed" | "range" });
  const [cat1Rows, setCat1Rows] = useState<{ id: string; name: string; unit: string; unitCustom: boolean; price: string; priceMax: string; priceMode: "fixed" | "range" }[]>([{ id: "c10", name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" }]);
  const [isSavingCat1, setIsSavingCat1] = useState(false);

  const handleSaveCat1 = async () => {
    const valid = cat1Rows.filter((r) => r.name.trim());
    if (!valid.length) { toast.error("请至少填写一个分类名称"); return; }
    setIsSavingCat1(true);
    try {
      for (const r of valid) {
        await saveCat.mutateAsync({
          name: r.name.trim(),
          unit: r.unit.trim(),
          price: parseFloat(r.price) || 0,
          priceMax: r.priceMode === "range" ? (parseFloat(r.priceMax) || 0) : 0,
          sort: rawCategories.length,
          enabled: true,
        });
      }
      for (const r of valid) { if (r.unit) bumpUnit(r.unit); }
      toast.success(`《${clinicName}》已添加 ${valid.length} 个一级分类`);
      setCat1Rows([{ id: "c10", name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" }]);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    } finally {
      setIsSavingCat1(false);
    }
  };

  // ===== Tab2：批量添加二级分类 =====
  const [selectedCat1ForSub, setSelectedCat1ForSub] = useState<number | null>(null);
  let cat2RowSeq = 0;
  const newCat2Row = () => ({ id: `c2${++cat2RowSeq}`, name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" as "fixed" | "range" });
  const [cat2Rows, setCat2Rows] = useState<{ id: string; name: string; unit: string; unitCustom: boolean; price: string; priceMax: string; priceMode: "fixed" | "range" }[]>([{ id: "c20", name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" }]);
  const [isSavingCat2, setIsSavingCat2] = useState(false);

  const handleSaveCat2 = async () => {
    if (!selectedCat1ForSub) { toast.error("请选择所属一级分类"); return; }
    const valid = cat2Rows.filter((r) => r.name.trim());
    if (!valid.length) { toast.error("请至少填写一个分类名称"); return; }
    const parentCat = rawCategories.find((c) => c.id === selectedCat1ForSub);
    const existingSubCount = parentCat?.subCategories.length ?? 0;
    setIsSavingCat2(true);
    try {
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        await saveCat.mutateAsync({
          parentId: selectedCat1ForSub,
          name: r.name.trim(),
          unit: r.unit.trim(),
          price: parseFloat(r.price) || 0,
          priceMax: r.priceMode === "range" ? (parseFloat(r.priceMax) || 0) : 0,
          sort: existingSubCount + i,
          enabled: true,
        });
      }
      for (const r of valid) { if (r.unit) bumpUnit(r.unit); }
      toast.success(`《${clinicName}》已添加 ${valid.length} 个二级分类`);
      setCat2Rows([{ id: "c20", name: "", unit: "次", unitCustom: false, price: "", priceMax: "", priceMode: "fixed" }]);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    } finally {
      setIsSavingCat2(false);
    }
  };

  // ===== Tab3：批量添加三级项目 =====
  const [selectedCat1ForProd, setSelectedCat1ForProd] = useState<number | null>(null);
  const [selectedCat2ForProd, setSelectedCat2ForProd] = useState<number | null>(null);

  // 当一级变化时，重置二级选择
  const handleCat1ForProdChange = (id: number | null) => {
    setSelectedCat1ForProd(id);
    setSelectedCat2ForProd(null);
  };

  const subCatsForProd = useMemo(() => {
    if (!selectedCat1ForProd) return [];
    const cat = sortedCats.find((c) => c.id === selectedCat1ForProd);
    if (!cat) return [];
    return (Array.isArray(cat.subCategories) ? cat.subCategories : []).sort((a, b) => a.sort - b.sort || a.id - b.id);
  }, [sortedCats, selectedCat1ForProd]);

  const [rows, setRows] = useState<ProdRow[]>([newRow()]);
  const [isSaving, setIsSaving] = useState(false);

  const updateRow = (id: string, patch: Partial<ProdRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleSaveAll = async () => {
    if (!selectedCat1ForProd) { toast.error("请选择所属一级分类"); return; }
    if (!selectedCat2ForProd) { toast.error("请选择所属二级分类"); return; }
    const valid = rows.filter((r) => r.name.trim());
    if (!valid.length) { toast.error("请至少填写一个项目名称"); return; }
    setIsSaving(true);
    try {
      for (const r of valid) {
        const unit = r.unit || "次";
        await saveProd.mutateAsync({
          categoryId: selectedCat1ForProd,
          subcategoryId: selectedCat2ForProd ?? null,
          name: r.name.trim(),
          unit,
          price: parseFloat(r.price) || 0,
          priceMax: r.priceMode === "range" ? (parseFloat(r.priceMax) || 0) : 0,
          isCommon: false,
          enabled: true,
          sort: 0,
        });
        bumpUnit(unit);
      }
      toast.success(`《${clinicName}》已添加 ${valid.length} 个项目`);
      setRows([newRow()]);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: "cat1", label: "添加一级分类" },
    { key: "cat2", label: "添加二级分类" },
    { key: "cat3", label: "添加三级项目" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 蓝色头部 */}
      <div className="sticky top-0 z-30 text-white" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-3">
          <button onClick={goBack} aria-label="返回" className="shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold leading-tight">添加收费内容</span>
          <div className="ml-1 flex-1 min-w-0">
            <YabanClinicHeader compact className="text-white/90" />
          </div>
        </div>

        {/* 3个Tab */}
        <div className="flex px-4 pb-3 gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white text-[#1E88D6]" : "bg-white/15 text-white/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-5 space-y-3 pb-32">

        {/* ===== Tab1：批量添加一级分类 ===== */}
        {tab === "cat1" && (
          <div className="bg-white rounded shadow-sm p-4 space-y-3">
            <p className="text-xs text-gray-400">一级分类是最顶层的大类，如「检查诊断」「补牙修复」等。价格/单位可选填。</p>
            {cat1Rows.map((row, idx) => (
              <div key={row.id} className="space-y-2 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">分类 {idx + 1}</span>
                  {cat1Rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCat1Rows((prev) => prev.filter((r) => r.id !== row.id))}
                      className="ml-auto shrink-0 text-gray-300 active:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <AiSearchInput
                  value={row.name}
                  onChange={(v) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: v } : r))}
                  placeholder="分类名称，如 补牙修复"
                  searchType="category"
                />
                {/* 价格类型切换 Pill */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-gray-400">价格：</span>
                  <button type="button" onClick={() => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "fixed" } : r))}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    固定
                  </button>
                  <button type="button" onClick={() => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "range" } : r))}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    范围
                  </button>
                </div>
                <div className="flex items-center gap-1.5 min-w-0 mb-2">
                  <input
                    value={row.price}
                    onChange={(e) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, price: e.target.value } : r))}
                    inputMode="decimal"
                    placeholder={row.priceMode === "fixed" ? "价格（0=面议）" : "最低价"}
                    className="flex-1 min-w-0 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                  />
                  {row.priceMode === "range" && (
                    <>
                      <span className="text-gray-400 text-sm shrink-0">~</span>
                      <input
                        value={row.priceMax}
                        onChange={(e) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMax: e.target.value } : r))}
                        inputMode="decimal"
                        placeholder="最高价"
                        className="flex-1 min-w-0 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                      />
                    </>
                  )}
                </div>
                <UnitPicker
                  value={row.unit}
                  onChange={(u) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unit: u, unitCustom: false } : r))}
                  myUnits={myUnits}
                  onSaveUnits={handleSaveUnits}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCat1Rows((prev) => [...prev, newCat1Row()])}
              className="w-full py-2.5 rounded-md border border-dashed border-gray-300 text-sm text-gray-400 flex items-center justify-center gap-1.5 active:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              再加一个一级分类
            </button>
            <button
              onClick={handleSaveCat1}
              disabled={isSavingCat1}
              className="w-full py-3 rounded-md text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {isSavingCat1 && <Loader2 className="w-4 h-4 animate-spin" />}
              保存一级分类（{cat1Rows.filter(r => r.name.trim()).length} 条）
            </button>
          </div>
        )}

        {/* ===== Tab2：批量添加二级分类 ===== */}
        {tab === "cat2" && (
          <>
            {/* 选择所属一级分类 */}
            <div className="bg-white rounded shadow-sm p-4">
              <label className="block text-xs text-gray-500 mb-1.5">所属一级分类（共 {sortedCats.length} 个）</label>
              <div className="relative">
                <select
                  value={selectedCat1ForSub ?? ""}
                  onChange={(e) => setSelectedCat1ForSub(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-gray-100 rounded-md pl-3 pr-8 py-2.5 text-sm outline-none appearance-none"
                >
                  <option value="">请选择一级分类…</option>
                  {sortedCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* 二级分类行列表 */}
            <div className="bg-white rounded shadow-sm p-4 space-y-3">
              <p className="text-xs text-gray-400">二级分类是一级下的子分类，如「前牙」「后牙」等。价格/单位可选填。</p>
              {cat2Rows.map((row, idx) => (
                <div key={row.id} className="space-y-2 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0">分类 {idx + 1}</span>
                    {cat2Rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCat2Rows((prev) => prev.filter((r) => r.id !== row.id))}
                        className="ml-auto shrink-0 text-gray-300 active:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <AiSearchInput
                    value={row.name}
                    onChange={(v) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: v } : r))}
                    placeholder="二级分类名称，如 前牙根管"
                    searchType="category"
                  />
                  {/* 价格类型切换 Pill */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400">价格：</span>
                    <button type="button" onClick={() => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "fixed" } : r))}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      固定
                    </button>
                    <button type="button" onClick={() => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "range" } : r))}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      范围
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 mb-2">
                    <input
                      value={row.price}
                      onChange={(e) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, price: e.target.value } : r))}
                      inputMode="decimal"
                      placeholder={row.priceMode === "fixed" ? "价格（0=面议）" : "最低价"}
                      className="flex-1 min-w-0 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                    />
                    {row.priceMode === "range" && (
                      <>
                        <span className="text-gray-400 text-sm shrink-0">~</span>
                        <input
                          value={row.priceMax}
                          onChange={(e) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMax: e.target.value } : r))}
                          inputMode="decimal"
                          placeholder="最高价"
                          className="flex-1 min-w-0 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                        />
                      </>
                    )}
                  </div>
                  <UnitPicker
                    value={row.unit}
                    onChange={(u) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unit: u, unitCustom: false } : r))}
                    myUnits={myUnits}
                    onSaveUnits={handleSaveUnits}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCat2Rows((prev) => [...prev, newCat2Row()])}
                className="w-full py-2.5 rounded-md border border-dashed border-gray-300 text-sm text-gray-400 flex items-center justify-center gap-1.5 active:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                再加一个二级分类
              </button>
              <button
                onClick={handleSaveCat2}
                disabled={isSavingCat2 || !selectedCat1ForSub}
                className="w-full py-3 rounded-md text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                {isSavingCat2 && <Loader2 className="w-4 h-4 animate-spin" />}
                保存二级分类（{cat2Rows.filter(r => r.name.trim()).length} 条）
              </button>
            </div>
          </>
        )}

        {/* ===== Tab3：批量添加三级项目 ===== */}
        {tab === "cat3" && (
          <>
            {/* 选择一级分类 */}
            <div className="bg-white rounded shadow-sm p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">所属一级分类（必选）</label>
                <div className="relative">
                  <select
                    value={selectedCat1ForProd ?? ""}
                    onChange={(e) => handleCat1ForProdChange(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-gray-100 rounded-md pl-3 pr-8 py-2.5 text-sm outline-none appearance-none"
                  >
                    <option value="">请选择一级分类…</option>
                    {sortedCats.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              {/* 选择二级分类（必选） */}
              {selectedCat1ForProd && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    所属二级分类（必选）
                  </label>
                  {subCatsForProd.length === 0 ? (
                    <div className="space-y-2">
                      {(() => {
                        const cat = sortedCats.find((c) => c.id === selectedCat1ForProd);
                        const hasDirectItems = (cat as any)?.items?.length > 0;
                        return hasDirectItems ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-3 space-y-2">
                            <p className="text-xs text-blue-600">
                              该一级分类下有 {(cat as any).items.length} 个旧项目，可一键迁移为二级分类，迁移后即可选择。
                            </p>
                            <button
                              type="button"
                              onClick={handleMigrate}
                              disabled={isMigrating}
                              className="w-full py-2 rounded-md text-white text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                              style={{ backgroundColor: ACCENT }}
                            >
                              {isMigrating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              {isMigrating ? "迁移中…" : "一键迁移旧项目为二级分类"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-md px-3 py-2.5">
                            <span className="text-xs text-orange-500 flex-1">该一级分类暂无二级分类，请先去「添加二级分类」Tab 添加</span>
                            <button
                              type="button"
                              onClick={() => setTab("cat2")}
                              className="shrink-0 text-xs font-medium text-[#1E88D6] active:underline"
                            >
                              去添加
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedCat2ForProd ?? ""}
                        onChange={(e) => setSelectedCat2ForProd(e.target.value ? Number(e.target.value) : null)}
                        className="w-full bg-gray-100 rounded-md pl-3 pr-8 py-2.5 text-sm outline-none appearance-none"
                      >
                        <option value="">请选择二级分类…</option>
                        {subCatsForProd.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 项目行列表 */}
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={row.id} className="bg-white rounded shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">项目 {idx + 1}</span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="text-gray-300 active:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* 项目名称 AI 搜索 */}
                  <AiSearchInput
                    value={row.name}
                    onChange={(v) => updateRow(row.id, { name: v })}
                    placeholder={`新项目${idx + 1}`}
                  />

                  {/* 价格类型切换 Pill */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400">价格：</span>
                    <button type="button" onClick={() => updateRow(row.id, { priceMode: "fixed" })}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      固定
                    </button>
                    <button type="button" onClick={() => updateRow(row.id, { priceMode: "range" })}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      范围
                    </button>
                  </div>

                  {/* 价格输入 */}
                  {row.priceMode === "fixed" ? (
                    <input
                      value={row.price}
                      onChange={(e) => updateRow(row.id, { price: e.target.value })}
                      inputMode="decimal"
                      placeholder="单价（0=面议）"
                      className="w-full bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={row.price}
                        onChange={(e) => updateRow(row.id, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="最低价"
                        className="flex-1 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                      />
                      <span className="text-gray-400 text-sm shrink-0">~</span>
                      <input
                        value={row.priceMax}
                        onChange={(e) => updateRow(row.id, { priceMax: e.target.value })}
                        inputMode="decimal"
                        placeholder="最高价"
                        className="flex-1 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                      />
                    </div>
                  )}

                  {/* 单位选择器 */}
                  <UnitPicker
                    value={row.unit}
                    onChange={(u) => updateRow(row.id, { unit: u, unitCustom: false })}
                    myUnits={myUnits}
                    onSaveUnits={handleSaveUnits}
                  />
                </div>
              ))}
            </div>

            {/* 再加一项 */}
            <button
              onClick={addRow}
              className="w-full py-3 rounded border-2 border-dashed border-gray-200 text-sm text-gray-400 flex items-center justify-center gap-1.5 active:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              再加一项
            </button>
          </>
        )}
      </div>

      {/* 底部固定保存按钮（仅添加三级项目 tab） */}
      {tab === "cat3" && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white/90 backdrop-blur border-t border-gray-100 max-w-[480px] mx-auto">
          <button
            onClick={handleSaveAll}
            disabled={isSaving || !selectedCat1ForProd || !selectedCat2ForProd || !rows.some((r) => r.name.trim())}
            className="w-full py-3.5 rounded-md text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            保存全部项目（{rows.filter((r) => r.name.trim()).length} 项）
          </button>
        </div>
      )}
    </div>
  );
}
