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
import { ChevronLeft, Layers, Plus, Loader2, ChevronDown, Trash2, Search, X } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

const ACCENT = "#1E88D6";
const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";
const PRESET_UNITS = ["次", "颗", "支", "套", "天", "课", "题", "个", "边", "局", "序"];

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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
    { query: debouncedQuery, type: "product" },
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

  // 单位频率记忆
  const UNIT_FREQ_KEY = `yaban_unit_freq_${currentTenantId}`;
  const getUnitFreq = useCallback((): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem(UNIT_FREQ_KEY) || "{}"); } catch { return {}; }
  }, [UNIT_FREQ_KEY]);
  const sortedUnits = useMemo(() => {
    const freq = getUnitFreq();
    return [...PRESET_UNITS].sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  }, [getUnitFreq]);
  const bumpUnit = (unit: string) => {
    const freq = getUnitFreq();
    freq[unit] = (freq[unit] || 0) + 1;
    localStorage.setItem(UNIT_FREQ_KEY, JSON.stringify(freq));
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
      for (const r of valid) { if (r.unit && !r.unitCustom) bumpUnit(r.unit); }
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
      for (const r of valid) { if (r.unit && !r.unitCustom) bumpUnit(r.unit); }
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
    return (cat?.subCategories ?? []).sort((a, b) => a.sort - b.sort || a.id - b.id);
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
        const unit = r.unitCustom ? r.unit.trim() || "次" : r.unit;
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
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
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
                <input
                  value={row.name}
                  onChange={(e) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: e.target.value } : r))}
                  placeholder="分类名称，如 补牙修复"
                  className="w-full bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                />
                {/* 价格类型切换 Pill */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-gray-400">价格：</span>
                  <button type="button" onClick={() => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "fixed" } : r))}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    固定
                  </button>
                  <button type="button" onClick={() => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "range" } : r))}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    范围
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
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
                  <div className="relative">
                    <select
                      value={row.unitCustom ? "自定义" : row.unit}
                      onChange={(e) => {
                        if (e.target.value === "自定义") {
                          setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unitCustom: true, unit: "" } : r));
                        } else {
                          setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unitCustom: false, unit: e.target.value } : r));
                        }
                      }}
                      className="w-full bg-gray-100 rounded-md pl-3 pr-7 py-2.5 text-sm outline-none appearance-none"
                    >
                      {sortedUnits.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      <option value="自定义">自定义…</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                  {row.unitCustom && (
                    <input
                      value={row.unit}
                      onChange={(e) => setCat1Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                      placeholder="输入自定义单位"
                      className="w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none"
                    />
                  )}
                </div>
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
            <div className="bg-white rounded-lg shadow-sm p-4">
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
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
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
                  <input
                    value={row.name}
                    onChange={(e) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: e.target.value } : r))}
                    placeholder="二级分类名称，如 前牙根管"
                    className="w-full bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                  />
                  {/* 价格类型切换 Pill */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400">价格：</span>
                    <button type="button" onClick={() => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "fixed" } : r))}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      固定
                    </button>
                    <button type="button" onClick={() => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, priceMode: "range" } : r))}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      范围
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
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
                    <div className="relative">
                      <select
                        value={row.unitCustom ? "自定义" : row.unit}
                        onChange={(e) => {
                          if (e.target.value === "自定义") {
                            setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unitCustom: true, unit: "" } : r));
                          } else {
                            setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unitCustom: false, unit: e.target.value } : r));
                          }
                        }}
                        className="w-full bg-gray-100 rounded-md pl-3 pr-7 py-2.5 text-sm outline-none appearance-none"
                      >
                        {sortedUnits.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                        <option value="自定义">自定义…</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    {row.unitCustom && (
                      <input
                        value={row.unit}
                        onChange={(e) => setCat2Rows((prev) => prev.map((r) => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                        placeholder="输入自定义单位"
                        className="w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none"
                      />
                    )}
                  </div>
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
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
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
                      {/* 如果该一级下有直接挂的项目，提示一键迁移 */}
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
                <div key={row.id} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
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

                  {/* 单价 + 单位 */}
                  {/* 价格类型切换 Pill */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400">价格：</span>
                    <button type="button" onClick={() => updateRow(row.id, { priceMode: "fixed" })}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "fixed" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      固定
                    </button>
                    <button type="button" onClick={() => updateRow(row.id, { priceMode: "range" })}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.priceMode === "range" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      范围
                    </button>
                  </div>
                  {row.priceMode === "fixed" ? (
                    <div className="flex gap-2">
                      <input
                        value={row.price}
                        onChange={(e) => updateRow(row.id, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="单价（0=面议）"
                        className="flex-1 bg-gray-100 rounded-md px-3 py-2.5 text-sm outline-none"
                      />
                      <div className="relative shrink-0">
                        <select
                          value={row.unitCustom ? "自定义" : row.unit}
                          onChange={(e) => {
                            if (e.target.value === "自定义") {
                              updateRow(row.id, { unitCustom: true, unit: "" });
                            } else {
                              updateRow(row.id, { unitCustom: false, unit: e.target.value });
                            }
                          }}
                          className="w-24 bg-gray-100 rounded-md pl-3 pr-7 py-2.5 text-sm outline-none appearance-none"
                        >
                          {sortedUnits.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                          <option value="自定义">自定义…</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
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
                      <div className="relative">
                        <select
                          value={row.unitCustom ? "自定义" : row.unit}
                          onChange={(e) => {
                            if (e.target.value === "自定义") {
                              updateRow(row.id, { unitCustom: true, unit: "" });
                            } else {
                              updateRow(row.id, { unitCustom: false, unit: e.target.value });
                            }
                          }}
                          className="w-full bg-gray-100 rounded-md pl-3 pr-7 py-2.5 text-sm outline-none appearance-none"
                        >
                          {sortedUnits.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                          <option value="自定义">自定义…</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                  {row.unitCustom && (
                    <input
                      value={row.unit}
                      onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                      placeholder="输入自定义单位"
                      className="w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 再加一项 */}
            <button
              onClick={addRow}
              className="w-full py-3 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 flex items-center justify-center gap-1.5 active:bg-gray-50"
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
