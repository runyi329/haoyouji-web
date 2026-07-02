/**
 * 牙伴齿科管理 - 入库
 * 路由：/yaban/inventory/inbound（?scan=1 直接唤起扫码框）
 * 流程：扫码或搜索选物品 -> 录入批次号/效期/数量/成本 -> 加入清单 -> 提交入库
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { toast } from "sonner";
import {
  ChevronLeft,
  Search,
  ScanLine,
  X,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  PackagePlus,
} from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

interface CartLine {
  materialId: number;
  name: string;
  unit: string;
  qty: string;
  batchNo: string;
  expiryDate: string;
  costPrice: string;
}

function useQueryParam(name: string) {
  const [location] = useLocation();
  return useMemo(() => {
    const qs = location.includes("?") ? location.split("?")[1] : (typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "");
    return new URLSearchParams(qs).get(name);
  }, [location, name]);
}

export default function YabanInventoryInbound() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const wantScan = useQueryParam("scan") === "1";

  const [keyword, setKeyword] = useState("");
  const [scanVal, setScanVal] = useState("");
  const [showScan, setShowScan] = useState(wantScan);
  const [supplier, setSupplier] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<{ materialId: number; name: string; unit: string } | null>(null);

  const utils = trpc.useUtils();
  const listQuery = trpc.yabanInventory.list.useQuery(
    { keyword: keyword.trim() || undefined },
    { enabled: keyword.trim().length > 0 }
  );

  const inbound = trpc.yabanInventory.inbound.useMutation({
    onSuccess: (r) => {
      toast.success(`入库成功 ${r.logNo}`);
      utils.yabanInventory.invalidate();
      navigate("/yaban/inventory");
    },
    onError: (e) => toast.error(e.message || "入库失败"),
  });

  // 扫码匹配
  const doScan = async () => {
    const code = scanVal.trim();
    if (!code) return;
    try {
      const m = await utils.yabanInventory.findByBarcode.fetch({ barcode: code });
      if (m) {
        setPicking({ materialId: m.id, name: m.name, unit: m.unit });
        setShowScan(false);
        setScanVal("");
      } else {
        toast.error("未找到该条码对应物品，请先在库存一览新增并绑定条码");
      }
    } catch {
      toast.error("查询失败");
    }
  };

  const addLine = (l: CartLine) => {
    setLines((prev) => [...prev, l]);
    setPicking(null);
  };

  const submit = () => {
    const valid = lines.filter((l) => Number(l.qty) > 0);
    if (valid.length === 0) { toast.error("请先添加入库物品"); return; }
    inbound.mutate({
      bizType: "purchase",
      supplier: supplier.trim() || undefined,
      remark: remark.trim() || undefined,
      items: valid.map((l) => ({
        materialId: l.materialId,
        qty: l.qty,
        batchNo: l.batchNo.trim() || undefined,
        expiryDate: l.expiryDate || undefined,
        costPrice: l.costPrice || undefined,
      })),
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-28">
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/inventory")} className="p-1"><ChevronLeft className="w-6 h-6" /></button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">入库</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={() => setShowScan(true)} className="p-1"><ScanLine className="w-5 h-5" /></button>
        </div>
      </div>

      {/* 搜索添加物品 */}
      <div className="px-4 pt-4">
        <div className="flex items-center bg-white rounded-md px-3 py-2 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索要入库的物品"
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 px-2" />
          {keyword && <X className="w-4 h-4 text-gray-400" onClick={() => setKeyword("")} />}
        </div>
        {keyword.trim() && (
          <div className="mt-2 bg-white rounded shadow-sm overflow-hidden">
            {listQuery.isLoading ? (
              <div className="py-6 flex justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (listQuery.data?.items || []).length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">无匹配，去库存一览新增物品</div>
            ) : (
              (listQuery.data?.items || []).map((it) => (
                <button key={it.id} onClick={() => setPicking({ materialId: it.id, name: it.name, unit: it.unit })}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="text-left">
                    <div className="text-sm text-gray-800">{it.name}</div>
                    <div className="text-xs text-gray-400">{it.spec || ""} 当前 {it.stock}{it.unit}</div>
                  </div>
                  <Plus className="w-5 h-5 text-sky-500" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 入库清单 */}
      <div className="px-4 pt-4">
        <div className="text-sm font-bold text-gray-700 mb-2 px-1">入库清单 ({lines.length})</div>
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded shadow-sm">
            <PackagePlus className="w-10 h-10 mb-2" />
            <p className="text-sm">扫码或搜索添加物品</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((l, idx) => (
              <div key={idx} className="bg-white rounded shadow-sm p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{l.name}</span>
                  <Trash2 className="w-4 h-4 text-gray-300" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} />
                </div>
                <div className="text-xs text-gray-400">
                  数量 {l.qty}{l.unit}
                  {l.batchNo ? ` · 批号 ${l.batchNo}` : ""}
                  {l.expiryDate ? ` · 效期 ${l.expiryDate}` : ""}
                  {l.costPrice ? ` · 单价 ¥${l.costPrice}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 供应商 / 备注 */}
      {lines.length > 0 && (
        <div className="px-4 pt-4 space-y-3">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="供应商（选填）"
            className="w-full bg-white rounded-md px-4 py-3 text-sm outline-none shadow-sm" />
          <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注（选填）"
            className="w-full bg-white rounded-md px-4 py-3 text-sm outline-none shadow-sm" />
        </div>
      )}

      {/* 底部提交 */}
      <div className="fixed bottom-0 inset-x-0 bg-white px-4 py-3 border-t border-gray-100 z-30">
        <button onClick={submit} disabled={inbound.isPending || lines.length === 0}
          className="w-full py-3 rounded-md text-white font-medium flex items-center justify-center disabled:opacity-50" style={{ background: BLUE_GRAD }}>
          {inbound.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-1.5" />确认入库 ({lines.length})</>}
        </button>
      </div>

      {/* 扫码框（手动输入/扫码枪） */}
      {showScan && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowScan(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">扫码 / 输入条码</span>
              <X className="w-5 h-5 text-gray-400" onClick={() => setShowScan(false)} />
            </div>
            <div className="flex gap-2">
              <input autoFocus value={scanVal} onChange={(e) => setScanVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doScan(); }}
                placeholder="对准条码 / 手动输入后回车"
                className="flex-1 border border-gray-200 rounded-md px-4 py-3 text-sm outline-none" />
              <button onClick={doScan} className="px-5 rounded-md text-white font-medium" style={{ background: BLUE_GRAD }}>查找</button>
            </div>
            <p className="text-xs text-gray-400 mt-3">支持外接扫码枪，扫描后自动带出物品；未绑定条码请先到库存一览编辑物品。</p>
          </div>
        </div>
      )}

      {/* 批次录入弹层 */}
      {picking && (
        <BatchEditor item={picking} onClose={() => setPicking(null)} onAdd={addLine} />
      )}
    </div>
  );
}

function BatchEditor({
  item,
  onClose,
  onAdd,
}: {
  item: { materialId: number; name: string; unit: string };
  onClose: () => void;
  onAdd: (l: CartLine) => void;
}) {
  const [qty, setQty] = useState("1");
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [costPrice, setCostPrice] = useState("");

  const confirm = () => {
    if (!(Number(qty) > 0)) { toast.error("请输入数量"); return; }
    onAdd({ materialId: item.materialId, name: item.name, unit: item.unit, qty, batchNo, expiryDate, costPrice });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold text-gray-800">{item.name}</span>
          <X className="w-5 h-5 text-gray-400" onClick={onClose} />
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-gray-500 mb-1.5">入库数量（{item.unit}）<span className="text-red-400">*</span></div>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal"
              className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1.5">批号</div>
              <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="选填"
                className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm outline-none" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1.5">有效期至</div>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-3 text-sm outline-none" />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">采购单价（元）</div>
            <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="decimal" placeholder="选填"
              className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm outline-none" />
          </div>
        </div>
        <button onClick={confirm} className="w-full mt-5 py-3 rounded-md text-white font-medium" style={{ background: BLUE_GRAD }}>
          加入清单
        </button>
      </div>
    </div>
  );
}
