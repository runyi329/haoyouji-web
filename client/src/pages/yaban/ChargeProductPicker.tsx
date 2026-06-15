/**
 * 收费项目库选择器（牙伴齿科）
 * 照搬既往史选择器交互范式：
 *  - 搜索：项目名模糊匹配
 *  - 常用置顶：高频项目快速选用
 *  - 分类折叠：按分类分组浏览
 *  - 单击即选用：返回项目名 + 单价 + 单位（开单时单次选一个项目）
 * 数据来自后端 listChargeProducts，单价随选用带回收费行。
 * 严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { Search, X, ChevronDown, ChevronRight, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";

const ACCENT = "#1E88D6";

export interface ChargeProductPick {
  id: number;
  name: string;
  price: number;
  unit: string;
}

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

  const categories: CatGroup[] = (listQuery.data?.categories as CatGroup[]) || [];
  const commons: ProdItem[] = (listQuery.data?.commons as ProdItem[]) || [];

  // 搜索结果（扁平）
  const searchResults = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return null;
    const all: ProdItem[] = [];
    for (const c of categories) for (const it of c.items) all.push(it);
    return all.filter((it) => it.name.toLowerCase().includes(k));
  }, [kw, categories]);

  if (!open) return null;

  const handlePick = (it: ProdItem) => {
    onPick({ id: it.id, name: it.name, price: it.price, unit: it.unit });
  };

  // 项目按钮（点击即选用并关闭）
  const ProdTag = ({ it }: { it: ProdItem }) => (
    <button
      onClick={() => handlePick(it)}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-gray-50 active:bg-gray-100 text-left"
    >
      <span className="text-sm font-medium text-gray-700">{it.name}</span>
      <span className="text-sm font-semibold shrink-0 ml-2" style={{ color: ACCENT }}>
        {it.price > 0 ? `¥${money(it.price)}` : "面议"}
        <span className="text-[11px] text-gray-400 font-normal">/{it.unit}</span>
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
          searchResults.length > 0 ? (
            <div className="px-4 py-3 space-y-2">
              {searchResults.map((it) => (
                <ProdTag key={it.id} it={it} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              未找到相关项目，可在项目库中先添加
            </div>
          )
        ) : (
          <>
            {commons.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-4 pt-3 pb-1.5">
                  <Star className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                  <span className="text-xs font-medium text-gray-400">常用项目</span>
                </div>
                <div className="px-4 pb-2 space-y-2">
                  {commons.map((it) => (
                    <ProdTag key={`common_${it.id}`} it={it} />
                  ))}
                </div>
              </>
            )}

            {categories.map((cat) => {
              if (cat.items.length === 0) return null;
              const isCollapsed = collapsed[cat.id];
              return (
                <div key={cat.id}>
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 active:bg-gray-100"
                  >
                    <span className="text-xs font-semibold text-gray-500">{cat.name}</span>
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="px-4 py-3 space-y-2">
                      {cat.items.map((it) => (
                        <ProdTag key={it.id} it={it} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {categories.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                暂无收费项目，请先到「收费项目库」添加
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
