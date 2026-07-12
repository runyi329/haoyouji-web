import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Plus, X, BarChart2, Check, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { SchemeConfig } from "./CustomSchemeWizard";

// Built-in schemes for comparison
const BUILTIN_SCHEMES = [
  {
    id: "herbalife",
    name: "康宝莱",
    schemeType: "staircase",
    color: "#16A34A",
    icon: "HB",
    industry: "营养保健品",
    levels: 8,
    generationDepth: 3,
    retailMarginBase: 25,
    directBonusBase: 5,
    totalPayoutCap: 30,
    antiAbuse: true,
    monthlyIncomeCap: 0,
    description: "经典阶梯级差制，按VP（业绩积分）晋级，全球最大直销公司之一",
  },
  {
    id: "amway",
    name: "安利",
    schemeType: "staircase",
    color: "#2563EB",
    icon: "AM",
    industry: "日用品/保健品",
    levels: 6,
    generationDepth: 3,
    retailMarginBase: 30,
    directBonusBase: 6,
    totalPayoutCap: 30,
    antiAbuse: true,
    monthlyIncomeCap: 0,
    description: "全球直销鼻祖，阶梯级差制，零售差价+绩效奖金双轨收益",
  },
  {
    id: "marykay",
    name: "玫琳凯",
    schemeType: "generation",
    color: "#DB2777",
    icon: "MK",
    industry: "美容护肤",
    levels: 5,
    generationDepth: 5,
    retailMarginBase: 50,
    directBonusBase: 4,
    totalPayoutCap: 30,
    antiAbuse: true,
    monthlyIncomeCap: 0,
    description: "代数制，以零售差价为主要收入，强调产品销售而非团队发展",
  },
  {
    id: "nuskin",
    name: "如新",
    schemeType: "generation",
    color: "#7C3AED",
    icon: "NS",
    industry: "美容/营养",
    levels: 7,
    generationDepth: 7,
    retailMarginBase: 30,
    directBonusBase: 5,
    totalPayoutCap: 30,
    antiAbuse: true,
    monthlyIncomeCap: 0,
    description: "太阳线制（代数制变体），以团队业绩为核心，激励深度强",
  },
  {
    id: "babycare",
    name: "葆婴",
    schemeType: "binary",
    color: "#F59E0B",
    icon: "BC",
    industry: "母婴用品",
    levels: 3,
    generationDepth: 2,
    retailMarginBase: 20,
    directBonusBase: 8,
    totalPayoutCap: 25,
    antiAbuse: true,
    monthlyIncomeCap: 50000,
    description: "双轨对碰制，左右两区业绩对碰计算奖金，新人启动快",
  },
  {
    id: "syjk",
    name: "数研金控",
    schemeType: "subscription",
    color: "#0EA5E9",
    icon: "SY",
    industry: "金融科技",
    levels: 5,
    generationDepth: 5,
    retailMarginBase: 0,
    directBonusBase: 10,
    totalPayoutCap: 30,
    antiAbuse: true,
    monthlyIncomeCap: 0,
    description: "订阅制分润，SaaS服务费按让利比例逐层分配，现代商业模式",
  },
];

interface CompareItem {
  id: string | number;
  name: string;
  schemeType: string;
  color: string;
  icon: string;
  industry: string;
  levels: number;
  generationDepth: number;
  retailMarginBase: number;
  directBonusBase: number;
  totalPayoutCap: number;
  antiAbuse: boolean;
  monthlyIncomeCap: number;
  description: string;
  isCustom?: boolean;
}

const SCHEME_TYPE_LABELS: Record<string, string> = {
  staircase: "阶梯级差制",
  generation: "代数制",
  binary: "双轨对碰制",
  matrix: "矩阵制",
  subscription: "订阅制分润",
};

const COMPARE_ROWS: { key: string; label: string; format: (v: any) => string }[] = [
  { key: "schemeType", label: "制度类型", format: (v: string) => SCHEME_TYPE_LABELS[v] || v },
  { key: "industry", label: "适用行业", format: (v: string) => v || "—" },
  { key: "levels", label: "层级数量", format: (v: number) => `${v} 级` },
  { key: "generationDepth", label: "代数深度", format: (v: number) => `${v} 代` },
  { key: "retailMarginBase", label: "零售差价", format: (v: number) => v > 0 ? `${v}%` : "—" },
  { key: "directBonusBase", label: "直推奖（基础）", format: (v: number) => `${v}%` },
  { key: "totalPayoutCap", label: "总拨出率上限", format: (v: number) => `${v}%` },
  { key: "antiAbuse", label: "防刷机制", format: (v: boolean) => v ? "已启用" : "未启用" },
  {
    key: "monthlyIncomeCap",
    label: "月收入封顶",
    format: (v: number) => v > 0 ? `¥${v.toLocaleString()}` : "无限制",
  },
];

export default function ComparePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialA = params.get("a");

  const [selected, setSelected] = useState<CompareItem[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const { data: customList } = trpc.customScheme.list.useQuery({ page: 1, pageSize: 50 });

  // Load initial scheme if provided
  const { data: initialScheme } = trpc.customScheme.get.useQuery(
    { id: parseInt(initialA || "0") },
    { enabled: !!initialA && !isNaN(parseInt(initialA || "0")) }
  );

  useEffect(() => {
    if (initialScheme && selected.length === 0) {
      let config: SchemeConfig | null = null;
      try { config = JSON.parse(initialScheme.config); } catch {}
      if (config) {
        setSelected([{
          id: initialScheme.id,
          name: initialScheme.name,
          schemeType: initialScheme.schemeType,
          color: initialScheme.color,
          icon: initialScheme.icon,
          industry: initialScheme.industry,
          levels: config.levels.length,
          generationDepth: config.generationDepth,
          retailMarginBase: config.retailMarginBase,
          directBonusBase: config.directBonusBase,
          totalPayoutCap: config.totalPayoutCap,
          antiAbuse: config.antiAbuse,
          monthlyIncomeCap: config.monthlyIncomeCap,
          description: config.description,
          isCustom: true,
        }]);
      }
    }
  }, [initialScheme]);

  const addBuiltin = (scheme: typeof BUILTIN_SCHEMES[0]) => {
    if (selected.length >= 4) return;
    if (selected.find((s) => s.id === scheme.id)) return;
    setSelected((prev) => [...prev, { ...scheme, isCustom: false }]);
    setShowPicker(false);
  };

  const addCustom = (scheme: { id: number; name: string; schemeType: string; color: string; icon: string; industry: string; config: string; description?: string | null }) => {
    if (selected.length >= 4) return;
    if (selected.find((s) => s.id === scheme.id)) return;
    let config: SchemeConfig | null = null;
    try { config = JSON.parse(scheme.config); } catch {}
    if (!config) return;
    setSelected((prev) => [
      ...prev,
      {
        id: scheme.id,
        name: scheme.name,
        schemeType: scheme.schemeType,
        color: scheme.color,
        icon: scheme.icon,
        industry: scheme.industry,
        levels: config!.levels.length,
        generationDepth: config!.generationDepth,
        retailMarginBase: config!.retailMarginBase,
        directBonusBase: config!.directBonusBase,
        totalPayoutCap: config!.totalPayoutCap,
        antiAbuse: config!.antiAbuse,
        monthlyIncomeCap: config!.monthlyIncomeCap,
        description: config!.description || "",
        isCustom: true,
      },
    ]);
    setShowPicker(false);
  };

  const remove = (id: string | number) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-gray-900 text-sm">制度对比分析</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">最多同时对比4套制度</div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Selected chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {selected.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-medium"
              style={{ borderColor: s.color, color: s.color, backgroundColor: s.color + "10" }}
            >
              <span>{s.icon}</span>
              <span>{s.name}</span>
              {s.isCustom && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">自建</span>}
              <button onClick={() => remove(s.id)} className="ml-1 hover:opacity-70">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {selected.length < 4 && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed border-gray-300 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500"
            >
              <Plus className="w-3.5 h-3.5" />
              添加制度
            </button>
          )}
        </div>

        {/* Picker modal */}
        {showPicker && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <span className="font-bold text-gray-900">选择要对比的制度</span>
                <button onClick={() => setShowPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">内置制度</div>
                <div className="space-y-2 mb-5">
                  {BUILTIN_SCHEMES.map((s) => {
                    const isAdded = !!selected.find((sel) => sel.id === s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => !isAdded && addBuiltin(s)}
                        disabled={isAdded}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left border transition-all ${
                          isAdded ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: s.color + "20", color: s.color }}>
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900">{s.name}</div>
                          <div className="text-xs text-gray-400">{s.industry} · {SCHEME_TYPE_LABELS[s.schemeType]}</div>
                        </div>
                        {isAdded && <Check className="w-4 h-4 text-green-500" />}
                      </button>
                    );
                  })}
                </div>

                {customList && customList.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">我的自建制度</div>
                    <div className="space-y-2">
                      {customList.map((s) => {
                        const isAdded = !!selected.find((sel) => sel.id === s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => !isAdded && addCustom(s)}
                            disabled={isAdded}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left border transition-all ${
                              isAdded ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: s.color + "20" }}>
                              {s.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-gray-900">{s.name}</div>
                              <div className="text-xs text-gray-400">{s.industry} · {SCHEME_TYPE_LABELS[s.schemeType] || s.schemeType}</div>
                            </div>
                            {isAdded ? <Check className="w-4 h-4 text-green-500" /> : <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">自建</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Comparison table */}
        {selected.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4 text-gray-300"><BarChart2 className="w-12 h-12 mx-auto" /></div>
            <div className="text-gray-600 font-semibold mb-2">还没有选择制度</div>
            <p className="text-sm text-gray-400 mb-6">点击上方"添加制度"按钮，选择要对比的奖金制度</p>
            <button
              onClick={() => setShowPicker(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
            >
              开始选择
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Header row */}
            <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `180px repeat(${selected.length}, 1fr)` }}>
              <div className="p-4 bg-gray-50" />
              {selected.map((s) => (
                <div key={s.id} className="p-4 text-center border-l border-gray-100">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold mx-auto mb-1" style={{ backgroundColor: s.color + "20", color: s.color }}>{s.icon}</div>
                  <div className="font-bold text-sm text-gray-900">{s.name}</div>
                  {s.isCustom && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">自建</span>}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {COMPARE_ROWS.map((row, ri) => (
              <div
                key={row.key}
                className="grid border-b border-gray-50"
                style={{ gridTemplateColumns: `180px repeat(${selected.length}, 1fr)` }}
              >
                <div className={`p-3 px-4 text-xs font-medium text-gray-500 flex items-center ${ri % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                  {row.label}
                </div>
                {selected.map((s) => {
                  const raw = (s as any)[row.key];
                  const formatted = row.format(raw);
                  const isGood =
                    row.key === "antiAbuse" ? raw === true :
                    row.key === "totalPayoutCap" ? raw <= 30 :
                    row.key === "levels" ? raw <= 3 :
                    null;
                  return (
                    <div
                      key={s.id}
                      className={`p-3 text-center text-sm border-l border-gray-100 font-medium ${ri % 2 === 0 ? "bg-gray-50" : "bg-white"} ${
                        isGood === true ? "text-green-600" : isGood === false ? "text-amber-600" : "text-gray-800"
                      }`}
                    >
                      {formatted}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Description row */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `180px repeat(${selected.length}, 1fr)` }}
            >
              <div className="p-3 px-4 text-xs font-medium text-gray-500 flex items-start pt-4">制度简介</div>
              {selected.map((s) => (
                <div key={s.id} className="p-3 text-xs text-gray-500 border-l border-gray-100 leading-relaxed">
                  {s.description || "—"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setLocation("/custom/new")}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            创建自定义制度
          </button>
          <button
            onClick={() => setLocation("/")}
            className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
