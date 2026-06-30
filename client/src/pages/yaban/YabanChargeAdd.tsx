/**
 * 牙伴齿科管理 - 添加收费内容
 * 路由：/yaban/settings/charge-add
 * 功能：选择「添加新分类」或「向已有分类批量添加项目」
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

interface CatGroup {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  items: { id: number; name: string }[];
}

interface ProdRow {
  id: string;
  name: string;
  price: string;
  unit: string;
  unitCustom: boolean;
}

type TabType = "cat" | "prod";

let rowSeq = 0;
const newRow = (): ProdRow => ({
  id: `r${++rowSeq}`,
  name: "",
  price: "",
  unit: "次",
  unitCustom: false,
});

// 库总数独立组件，无条件查询
function useChargeLibTotal(libType: "category" | "product") {
  const { data } = trpc.yabanCustomer.searchChargeLib.useQuery(
    { query: "", type: libType },
    { staleTime: 30000 }
  );
  return data?.total ?? 0;
}

// ===== AI 搜索输入框组件 =====
function AiSearchInput({
  value,
  onChange,
  placeholder,
  libType,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  libType: "category" | "product";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // 同步外部 value
  useEffect(() => { setQuery(value); }, [value]);

  // 防抖搜索
  const handleInput = (v: string) => {
    setQuery(v);
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(v), 200);
    setOpen(true);
  };

  const { data: libData } = trpc.yabanCustomer.searchChargeLib.useQuery(
    { query: debouncedQuery, type: libType },
    { enabled: open, staleTime: 5000 }
  );
  const suggestions = libData?.items ?? [];
  // 库总数无条件查询
  const displayTotal = useChargeLibTotal(libType);

  // 点击外部关闭
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
      {open && (suggestions.length > 0) && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-full bg-white rounded-md shadow-lg ring-1 ring-black/5 overflow-hidden max-h-52 overflow-y-auto">
            {suggestions.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setQuery(opt);
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm active:bg-blue-50 flex items-center gap-2 ${
                  i > 0 ? "border-t border-gray-50" : ""
                }`}
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

  const [tab, setTab] = useState<TabType>("cat");

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
  const refresh = () => utils.yabanCustomer.listChargeProducts.invalidate();

  // 首次加载时自动将现有数据导入行业库
  useEffect(() => {
    const KEY = "yaban_charge_lib_seeded_v1";
    if (!localStorage.getItem(KEY)) {
      seedLib.mutate(undefined, {
        onSuccess: (res) => {
          localStorage.setItem(KEY, "1");
          // 静默刷新库缓存
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

  // ===== 批量添加分类 =====
  let catRowSeq = 0;
  const newCatRow = () => ({ id: `c${++catRowSeq}`, name: "" });
  const [catRows, setCatRows] = useState<{ id: string; name: string }[]>([{ id: "c0", name: "" }]);
  const [isSavingCat, setIsSavingCat] = useState(false);

  const updateCatRow = (id: string, name: string) =>
    setCatRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  const addCatRow = () => setCatRows((prev) => [...prev, newCatRow()]);
  const removeCatRow = (id: string) =>
    setCatRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleSaveCat = async () => {
    const valid = catRows.filter((r) => r.name.trim());
    if (!valid.length) { toast.error("请至少填写一个分类名称"); return; }
    setIsSavingCat(true);
    try {
      for (const r of valid) {
        await saveCat.mutateAsync({ name: r.name.trim(), sort: rawCategories.length, enabled: true });
      }
      toast.success(`《${clinicName}》已添加 ${valid.length} 个分类`);
      setCatRows([{ id: "c0", name: "" }]);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    } finally {
      setIsSavingCat(false);
    }
  };

  // ===== 批量添加项目 =====
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProdRow[]>([newRow()]);
  const [isSaving, setIsSaving] = useState(false);

  const updateRow = (id: string, patch: Partial<ProdRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleSaveAll = async () => {
    if (!selectedCatId) { toast.error("请选择所属分类"); return; }
    const valid = rows.filter((r) => r.name.trim());
    if (!valid.length) { toast.error("请至少填写一个项目名称"); return; }
    setIsSaving(true);
    try {
      for (const r of valid) {
        const unit = r.unitCustom ? r.unit.trim() || "次" : r.unit;
        await saveProd.mutateAsync({
          categoryId: selectedCatId,
          name: r.name.trim(),
          unit,
          price: parseFloat(r.price) || 0,
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

        {/* Tab 切换 */}
        <div className="flex px-4 pb-3 gap-2">
          <button
            onClick={() => setTab("cat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-md text-base font-medium transition-colors ${
              tab === "cat" ? "bg-white text-[#1E88D6]" : "bg-white/15 text-white/80"
            }`}
          >
            <Layers className="w-5 h-5" />
            添加新分类
          </button>
          <button
            onClick={() => setTab("prod")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-md text-base font-medium transition-colors ${
              tab === "prod" ? "bg-white text-[#1E88D6]" : "bg-white/15 text-white/80"
            }`}
          >
            <Plus className="w-5 h-5" />
            添加项目
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-5 space-y-3 pb-32">
        {tab === "cat" ? (
          /* ===== 批量添加分类 ===== */
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            {catRows.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <AiSearchInput
                    value={row.name}
                    onChange={(v) => updateCatRow(row.id, v)}
                    libType="category"
                  />
                </div>
                {catRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCatRow(row.id)}
                    className="shrink-0 text-gray-300 active:text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCatRow}
              className="w-full py-2.5 rounded-md border border-dashed border-gray-300 text-sm text-gray-400 flex items-center justify-center gap-1.5 active:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              再加一个分类
            </button>
            <button
              onClick={handleSaveCat}
              disabled={isSavingCat}
              className="w-full py-3 rounded-md text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {isSavingCat && <Loader2 className="w-4 h-4 animate-spin" />}
              保存分类（{catRows.filter(r => r.name.trim()).length} 条）
            </button>
          </div>
        ) : (
          /* ===== 批量添加项目 ===== */
          <>
            {/* 选择分类 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <label className="block text-xs text-gray-500 mb-1.5">所属分类（现有分类共 {sortedCats.length} 个）</label>
              <div className="relative">
                <select
                  value={selectedCatId ?? ""}
                  onChange={(e) => setSelectedCatId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-gray-100 rounded-md pl-3 pr-8 py-2.5 text-sm outline-none appearance-none"
                >
                  <option value="">请选择分类…</option>
                  {sortedCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
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
                    libType="product"
                  />

                  {/* 单价 + 单位 */}
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

      {/* 底部固定保存按钮（仅添加项目 tab） */}
      {tab === "prod" && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white/90 backdrop-blur border-t border-gray-100 max-w-[480px] mx-auto">
          <button
            onClick={handleSaveAll}
            disabled={isSaving || !selectedCatId || !rows.some((r) => r.name.trim())}
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
