// @ts-nocheck
import { useState, useMemo } from "react";
import { mtrpc } from "./mibanTrpc";
import { toast } from "sonner";
import { Loader2, Plus, Minus, ChevronDown, ChevronUp, Trash2, Package } from "lucide-react";

// ─── 库存管理面板 ──────────────────────────────────────────────────────────────
export default function InventoryPanel() {
  const [activeView, setActiveView] = useState<"stock" | "logs">("stock");
  const [showInForm, setShowInForm] = useState(false);
  const [showOutForm, setShowOutForm] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);
  const [inQty, setInQty] = useState("");
  const [inCost, setInCost] = useState("");
  const [inNote, setInNote] = useState("");
  const [outQty, setOutQty] = useState("");
  const [outNote, setOutNote] = useState("");
  const [filterCatalogId, setFilterCatalogId] = useState<number | null>(null);

  const utils = mtrpc.useUtils();

  // 查询库存列表
  const { data: stockList = [], isLoading: stockLoading } = mtrpc.inventory.stockList.useQuery();

  // 查询流水
  const { data: logList = [], isLoading: logLoading } = mtrpc.inventory.logList.useQuery({
    catalogId: filterCatalogId ?? undefined,
    limit: 200,
  });

  // 入库 mutation
  const stockInMut = mtrpc.inventory.stockIn.useMutation({
    onSuccess: () => {
      toast.success("入库成功");
      utils.inventory.stockList.invalidate();
      utils.inventory.logList.invalidate();
      setShowInForm(false);
      setInQty(""); setInCost(""); setInNote(""); setSelectedCatalogId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "入库失败"),
  });

  // 出库 mutation
  const stockOutMut = mtrpc.inventory.stockOut.useMutation({
    onSuccess: () => {
      toast.success("出库成功");
      utils.inventory.stockList.invalidate();
      utils.inventory.logList.invalidate();
      setShowOutForm(false);
      setOutQty(""); setOutNote(""); setSelectedCatalogId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "出库失败"),
  });

  // 删除流水
  const logDeleteMut = mtrpc.inventory.logDelete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.inventory.stockList.invalidate();
      utils.inventory.logList.invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "删除失败"),
  });

  // 统计汇总
  const totalStock = useMemo(() => stockList.reduce((s: number, r: any) => s + (r.stockJin ?? 0), 0), [stockList]);
  const totalValue = useMemo(() => stockList.reduce((s: number, r: any) => s + (r.stockJin ?? 0) * (r.pricePerJin ?? 0), 0), [stockList]);
  const lowStockCount = useMemo(() => stockList.filter((r: any) => r.stockJin < 10).length, [stockList]);

  function handleStockIn() {
    if (!selectedCatalogId) return toast.error("请选择米种");
    const qty = parseFloat(inQty);
    if (!qty || qty <= 0) return toast.error("请输入有效数量");
    stockInMut.mutate({
      catalogId: selectedCatalogId,
      qtyJin: qty,
      costPerJin: inCost ? parseFloat(inCost) : undefined,
      note: inNote || undefined,
    });
  }

  function handleStockOut() {
    if (!selectedCatalogId) return toast.error("请选择米种");
    const qty = parseFloat(outQty);
    if (!qty || qty <= 0) return toast.error("请输入有效数量");
    stockOutMut.mutate({
      catalogId: selectedCatalogId,
      qtyJin: qty,
      note: outNote || undefined,
    });
  }

  const selectedRice = stockList.find((r: any) => r.catalogId === selectedCatalogId);

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[11px] text-gray-400 mb-1">总库存</p>
          <p className="text-[18px] font-bold text-gray-800">{totalStock.toFixed(0)}<span className="text-[11px] font-normal text-gray-400 ml-0.5">斤</span></p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[11px] text-gray-400 mb-1">库存价值</p>
          <p className="text-[18px] font-bold text-gray-800">¥{totalValue.toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[11px] text-gray-400 mb-1">低库存</p>
          <p className={`text-[18px] font-bold ${lowStockCount > 0 ? "text-red-500" : "text-gray-800"}`}>{lowStockCount}<span className="text-[11px] font-normal text-gray-400 ml-0.5">种</span></p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowInForm(!showInForm); setShowOutForm(false); setSelectedCatalogId(null); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-95"
          style={{ background: "#FF6900" }}
        >
          <Plus className="w-4 h-4" /> 入库
        </button>
        <button
          onClick={() => { setShowOutForm(!showOutForm); setShowInForm(false); setSelectedCatalogId(null); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 transition-all active:scale-95"
        >
          <Minus className="w-4 h-4" /> 出库
        </button>
      </div>

      {/* 入库表单 */}
      {showInForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-[14px] font-bold text-gray-800">入库登记</p>
          <div>
            <label className="text-[12px] text-gray-500 mb-1 block">选择米种</label>
            <select
              value={selectedCatalogId ?? ""}
              onChange={e => setSelectedCatalogId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
            >
              <option value="">请选择米种</option>
              {stockList.map((r: any) => (
                <option key={r.catalogId} value={r.catalogId}>
                  {r.riceName}（当前 {r.stockJin.toFixed(1)} 斤）
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[12px] text-gray-500 mb-1 block">入库数量（斤）</label>
              <input
                type="number" min="0.1" step="0.1"
                value={inQty} onChange={e => setInQty(e.target.value)}
                placeholder="如：50"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-[12px] text-gray-500 mb-1 block">进货价（元/斤，选填）</label>
              <input
                type="number" min="0" step="0.01"
                value={inCost} onChange={e => setInCost(e.target.value)}
                placeholder="如：4.5"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] text-gray-500 mb-1 block">备注（选填）</label>
            <input
              type="text"
              value={inNote} onChange={e => setInNote(e.target.value)}
              placeholder="如：供应商名称、批次号"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
            />
          </div>
          <button
            onClick={handleStockIn}
            disabled={stockInMut.isPending}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            style={{ background: "#FF6900" }}
          >
            {stockInMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            确认入库
          </button>
        </div>
      )}

      {/* 出库表单 */}
      {showOutForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-[14px] font-bold text-gray-800">手动出库</p>
          <div>
            <label className="text-[12px] text-gray-500 mb-1 block">选择米种</label>
            <select
              value={selectedCatalogId ?? ""}
              onChange={e => setSelectedCatalogId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
            >
              <option value="">请选择米种</option>
              {stockList.filter((r: any) => r.stockJin > 0).map((r: any) => (
                <option key={r.catalogId} value={r.catalogId}>
                  {r.riceName}（库存 {r.stockJin.toFixed(1)} 斤）
                </option>
              ))}
            </select>
          </div>
          {selectedRice && (
            <p className="text-[12px] text-gray-500">当前库存：<span className="font-semibold text-gray-700">{selectedRice.stockJin.toFixed(1)} 斤</span></p>
          )}
          <div>
            <label className="text-[12px] text-gray-500 mb-1 block">出库数量（斤）</label>
            <input
              type="number" min="0.1" step="0.1"
              value={outQty} onChange={e => setOutQty(e.target.value)}
              placeholder="如：10"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="text-[12px] text-gray-500 mb-1 block">备注（选填）</label>
            <input
              type="text"
              value={outNote} onChange={e => setOutNote(e.target.value)}
              placeholder="如：损耗、盘点调整"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-orange-400"
            />
          </div>
          <button
            onClick={handleStockOut}
            disabled={stockOutMut.isPending}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-gray-700 bg-gray-100 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            {stockOutMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            确认出库
          </button>
        </div>
      )}

      {/* 视图切换 */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm">
        {[{ key: "stock", label: "库存总览" }, { key: "logs", label: "流水记录" }].map(v => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key as any)}
            className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={{
              background: activeView === v.key ? "#FF6900" : "transparent",
              color: activeView === v.key ? "#fff" : "#888",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* 库存总览 */}
      {activeView === "stock" && (
        <div className="space-y-2">
          {stockLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : stockList.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-[13px]">暂无数据</div>
          ) : (
            stockList.map((r: any) => (
              <div key={r.catalogId} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: r.colorHex ?? "#C8A87A" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{r.riceName}</p>
                  <p className="text-[11px] text-gray-400">{r.category} · 参考价 ¥{r.pricePerJin}/斤</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-[15px] font-bold ${r.stockJin < 10 ? "text-red-500" : "text-gray-800"}`}>
                    {r.stockJin.toFixed(1)}<span className="text-[11px] font-normal text-gray-400 ml-0.5">斤</span>
                  </p>
                  <p className="text-[11px] text-gray-400">≈ ¥{(r.stockJin * r.pricePerJin).toFixed(0)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 流水记录 */}
      {activeView === "logs" && (
        <div className="space-y-2">
          {/* 筛选 */}
          <div className="bg-white rounded-xl px-3 py-2 shadow-sm">
            <select
              value={filterCatalogId ?? ""}
              onChange={e => setFilterCatalogId(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-[12px] text-gray-600 bg-transparent focus:outline-none"
            >
              <option value="">全部米种</option>
              {stockList.map((r: any) => (
                <option key={r.catalogId} value={r.catalogId}>{r.riceName}</option>
              ))}
            </select>
          </div>

          {logLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : logList.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-[13px]">暂无流水记录</div>
          ) : (
            logList.map((log: any) => (
              <div key={log.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${log.type === 'in' ? 'bg-green-50' : 'bg-red-50'}`}>
                  {log.type === 'in'
                    ? <Plus className="w-3.5 h-3.5 text-green-500" />
                    : <Minus className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${log.type === 'in' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                      {log.type === 'in' ? '入库' : '出库'}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-800 truncate">{log.riceName}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {log.qtyJin.toFixed(1)} 斤
                    {log.costPerJin != null ? ` · 成本 ¥${log.costPerJin}/斤` : ""}
                    {log.note ? ` · ${log.note}` : ""}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{log.createdAt?.slice(0, 16).replace('T', ' ')} · {log.operator ?? "管理员"}</p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("确认删除此流水记录？库存将同步回滚。")) {
                      logDeleteMut.mutate({ id: log.id });
                    }
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
