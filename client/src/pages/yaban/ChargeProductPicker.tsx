/**
 * 收费项目库选择器（牙伴齿科）三级结构版
 *  - 搜索：扁平化显示路径（一级 > 二级 > 项目名）
 *  - 分类折叠：一级可折叠，二级和三级平铺
 *  - 单击即选用：返回项目名 + 单价 + 单位
 * 严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { Search, X, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

const ACCENT = "#1E88D6";

export interface ChargeProductPick {
  id: number;
  name: string;
  price: number;
  priceMax: number;
  unit: string;
}

// 三级数据结构（与 listChargeProducts 返回一致）
interface ProdItem {
  id: number;
  name: string;
  unit: string;
  price: number;
  priceMax: number;
  enabled: boolean;
  sort: number;
  subcategoryId?: number | null;
  categoryId?: number | null;
}

interface SubCatGroup {
  id: number;
  parentId: number;
  name: string;
  sort: number;
  enabled: boolean;
  price: number;
  priceMax: number;
  unit: string;
  items: ProdItem[]; // 三级项目
}

interface CatGroup {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  price: number;
  priceMax: number;
  unit: string;
  subCategories: SubCatGroup[];
  directItems: ProdItem[]; // 直接挂一级的项目（视为二级）
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function priceLabel(price: number, priceMax: number, unit: string): string {
  if (price <= 0 && (!priceMax || priceMax <= 0)) return "面议";
  const unitStr = unit ? `/${unit}` : "";
  if (priceMax && priceMax > 0 && priceMax !== price) {
    return `${money(price)}~${money(priceMax)}${unitStr}`;
  }
  return `${money(price)}${unitStr}`;
}

function isPriceNegotiated(price: number, priceMax: number): boolean {
  return price <= 0 && (!priceMax || priceMax <= 0);
}

export default function ChargeProductPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: ChargeProductPick) => void;
}) {
  const [kw, setKw] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const listQuery = trpc.yabanCustomer.listChargeProducts.useQuery(
    { includeDisabled: false },
    { enabled: open, refetchOnWindowFocus: false }
  );

  // open 时清空搜索
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setKw("");
  }

  const categories: CatGroup[] = (listQuery.data?.categories as unknown as CatGroup[]) || [];

  // 扁平化所有可选项（含路径）用于搜索
  const allItems = useMemo(() => {
    const result: Array<{ item: ProdItem; path: string }> = [];
    for (const cat of categories) {
      // 直接挂一级的项目（视为二级）
      for (const it of (cat.directItems || [])) {
        result.push({ item: it, path: `${cat.name}` });
      }
      // 二级分类自身（有价格可选）
      for (const sub of (cat.subCategories || [])) {
        // 二级分类本身可选（如有价格）
        if (sub.price > 0 || sub.priceMax > 0) {
          result.push({
            item: { id: sub.id * -1, name: sub.name, unit: sub.unit, price: sub.price, priceMax: sub.priceMax, enabled: sub.enabled, sort: sub.sort },
            path: `${cat.name}`,
          });
        }
        // 三级项目
        for (const it of (sub.items || [])) {
          result.push({ item: it, path: `${cat.name} > ${sub.name}` });
        }
      }
    }
    return result;
  }, [categories]);

  // 搜索结果（扁平，含路径）
  const searchResults = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return null;
    return allItems.filter(({ item }) => item.name.toLowerCase().includes(k));
  }, [kw, allItems]);

  if (!open) return null;

  const handlePick = (it: ProdItem) => {
    onPick({ id: Math.abs(it.id), name: it.name, price: it.price, priceMax: it.priceMax || 0, unit: it.unit });
  };

  // 项目行
  const ProdRow = ({ it, path }: { it: ProdItem; path?: string }) => (
    <button
      onClick={() => handlePick(it)}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-gray-50 active:bg-gray-100 text-left"
    >
      <div className="flex flex-col min-w-0">
        {path && (
          <span className="text-[10px] text-gray-400 mb-0.5 truncate">{path}</span>
        )}
        <span className="text-sm font-medium text-gray-700">{it.name}</span>
      </div>
      <span
        className="text-sm font-semibold shrink-0 ml-2"
        style={{ color: isPriceNegotiated(it.price, it.priceMax) ? "#9CA3AF" : ACCENT }}
      >
        {priceLabel(it.price, it.priceMax, it.unit)}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="text-base font-medium" style={{ color: ACCENT }}>
          取消
        </button>
        <h2 className="text-base font-semibold text-gray-900">选择收费项目</h2>
        <span className="w-8" />
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索项目名，如 拔牙 / 洁牙 / 种植"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          {kw && (
            <button onClick={() => setKw("")} className="shrink-0 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto">
        {listQuery.isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">加载中…</div>
        ) : searchResults ? (
          /* 搜索结果：扁平化 + 显示路径 */
          searchResults.length > 0 ? (
            <div className="px-4 py-3 space-y-2">
              {searchResults.map(({ item, path }, idx) => (
                <ProdRow key={`sr_${item.id}_${idx}`} it={item} path={path} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              未找到相关项目，可在项目库中先添加
            </div>
          )
        ) : (
          /* 正常浏览：三级结构 */
          <>
            {categories.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                暂无收费项目，请先到「收费项目库」添加
              </div>
            ) : (
              categories.map((cat) => {
                const directItems = cat.directItems || [];
                const subCats = cat.subCategories || [];
                const hasContent = directItems.length > 0 || subCats.some(s => (s.items || []).length > 0 || s.price > 0);
                if (!hasContent) return null;
                const isCollapsed = collapsed[cat.id];
                return (
                  <div key={cat.id}>
                    {/* 一级分类头（可折叠） */}
                    <button
                      onClick={() => setCollapsed((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 active:bg-gray-100"
                    >
                      <span className="text-xs font-semibold text-gray-600">{cat.name}</span>
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    {!isCollapsed && (
                      <div className="px-4 py-2 space-y-1.5">
                        {/* 直接挂一级的项目（视为二级，平铺） */}
                        {directItems.map((it) => (
                          <ProdRow key={`d_${it.id}`} it={it} />
                        ))}

                        {/* 二级分类 + 其下三级项目 */}
                        {subCats.map((sub) => {
                          const subItems = sub.items || [];
                          return (
                            <div key={`sub_${sub.id}`}>
                              {/* 二级分类标题行（灰色小标题） */}
                              <div className="flex items-center justify-between pt-1.5 pb-0.5">
                                <span className="text-[11px] font-medium text-gray-400">{sub.name}</span>
                                {(sub.price > 0 || sub.priceMax > 0) && (
                                  <button
                                    onClick={() => handlePick({
                                      id: sub.id,
                                      name: sub.name,
                                      unit: sub.unit,
                                      price: sub.price,
                                      priceMax: sub.priceMax,
                                      enabled: sub.enabled,
                                      sort: sub.sort,
                                    })}
                                    className="text-xs font-semibold shrink-0 ml-2 px-2 py-0.5 rounded-full bg-blue-50 active:bg-blue-100"
                                    style={{ color: ACCENT }}
                                  >
                                    {priceLabel(sub.price, sub.priceMax, sub.unit)}
                                  </button>
                                )}
                              </div>
                              {/* 三级项目（平铺在二级下） */}
                              {subItems.map((it) => (
                                <ProdRow key={`p_${it.id}`} it={it} />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
