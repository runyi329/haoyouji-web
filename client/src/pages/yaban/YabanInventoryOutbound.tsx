/**
 * 牙伴齿科管理 - 领用出库（购物车 / 点餐模式）
 * 路由：/yaban/inventory/outbound
 * 在物品列表上直接 +/- 选数量，底部购物车结算；默认 FEFO 自动扣批次
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Search,
  X,
  Minus,
  Plus,
  Loader2,
  ShoppingCart,
  CheckCircle2,
  Boxes,
} from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

const BIZ_TYPES = [
  { key: "use", label: "诊疗领用" },
  { key: "scrap", label: "报损" },
  { key: "return", label: "退库" },
];

export default function YabanInventoryOutbound() {
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bizType, setBizType] = useState("use");
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const [chair, setChair] = useState("");
  const [remark, setRemark] = useState("");

  const utils = trpc.useUtils();
  const catsQuery = trpc.yabanInventory.categories.useQuery();
  const listQuery = trpc.yabanInventory.list.useQuery({ keyword: keyword.trim() || undefined, categoryId });
  const membersQuery = trpc.yabanCustomer.listClinicMembers.useQuery(undefined, { enabled: showConfirm });
  const items = listQuery.data?.items || [];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const outbound = trpc.yabanInventory.outbound.useMutation({
    onSuccess: (r) => {
      toast.success(`出库成功 ${r.logNo}`);
      utils.yabanInventory.invalidate();
      navigate("/yaban/inventory");
    },
    onError: (e) => toast.error(e.message || "出库失败"),
  });

  const setQty = (id: number, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const cartLines = Object.entries(cart).map(([id, qty]) => {
    const m = itemMap.get(Number(id));
    return { id: Number(id), qty, name: m?.name || "", unit: m?.unit || "", stock: m?.stock ?? 0 };
  });
  const totalKinds = cartLines.length;
  const totalQty = cartLines.reduce((s, l) => s + l.qty, 0);

  const submit = () => {
    if (totalKinds === 0) { toast.error("请先选择领用物品"); return; }
    outbound.mutate({
      bizType: bizType as any,
      receiverId: receiverId ?? undefined,
      receiverName: receiverId ? (membersQuery.data || []).find((m) => m.userId === receiverId)?.name : undefined,
      chair: chair.trim() || undefined,
      remark: remark.trim() || undefined,
      items: cartLines.map((l) => ({ materialId: l.id, qty: l.qty })),
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="INV04" />
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/inventory")} className="p-1"><ChevronLeft className="w-6 h-6" /></button>
          <span className="text-lg font-bold">领用出库</span>
          <div className="w-8" />
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center bg-white/95 rounded-full px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索耗材"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 px-2" />
            {keyword && <X className="w-4 h-4 text-gray-400" onClick={() => setKeyword("")} />}
          </div>
        </div>
      </div>

      {/* 分类 */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => setCategoryId(undefined)}
          className={`shrink-0 px-3 py-1 rounded-full text-xs ${categoryId === undefined ? "bg-sky-100 text-sky-600 font-medium" : "bg-white text-gray-400"}`}>全部</button>
        {(catsQuery.data || []).map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs ${categoryId === c.id ? "bg-sky-100 text-sky-600 font-medium" : "bg-white text-gray-400"}`}>{c.name}</button>
        ))}
      </div>

      {/* 物品列表（点餐式 +/-） */}
      <div className="px-4 pt-4">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-2.5">
            {items.map((it) => {
              const q = cart[it.id] || 0;
              const disabled = it.stock <= 0;
              return (
                <div key={it.id} className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                    <Boxes className="w-5 h-5 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{it.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{it.spec || it.categoryName} · 库存 <span className={it.stock <= 0 ? "text-red-500" : ""}>{it.stock}</span>{it.unit}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q > 0 && (
                      <>
                        <button onClick={() => setQty(it.id, q - 1)} className="w-7 h-7 rounded-full border border-sky-400 text-sky-500 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                        <span className="w-6 text-center text-sm font-bold text-gray-800">{q}</span>
                      </>
                    )}
                    <button disabled={disabled || q >= it.stock} onClick={() => setQty(it.id, q + 1)}
                      className="w-7 h-7 rounded-full text-white flex items-center justify-center disabled:opacity-30" style={{ background: BLUE_GRAD }}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部购物车条 */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-3 z-30 flex items-center gap-3">
        <button onClick={() => totalKinds > 0 && setShowCart(true)} className="relative">
          <ShoppingCart className={`w-7 h-7 ${totalKinds > 0 ? "text-sky-500" : "text-gray-300"}`} />
          {totalKinds > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4.5 h-4.5 px-1 flex items-center justify-center min-w-[18px] h-[18px]">{totalKinds}</span>}
        </button>
        <div className="flex-1 text-sm text-gray-500">{totalKinds > 0 ? `已选 ${totalKinds} 种 / ${totalQty} 件` : "请选择领用物品"}</div>
        <button onClick={() => totalKinds > 0 && setShowConfirm(true)} disabled={totalKinds === 0}
          className="px-6 py-2.5 rounded-full text-white font-medium disabled:opacity-40" style={{ background: BLUE_GRAD }}>去出库</button>
      </div>

      {/* 购物车明细 */}
      {showCart && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end" onClick={() => setShowCart(false)}>
          <div className="w-full bg-white rounded-t-3xl max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">已选清单</span>
              <button className="text-xs text-gray-400" onClick={() => setCart({})}>清空</button>
            </div>
            <div className="px-5 py-3 space-y-3">
              {cartLines.map((l) => (
                <div key={l.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-800">{l.name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(l.id, l.qty - 1)} className="w-7 h-7 rounded-full border border-sky-400 text-sky-500 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                    <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                    <button disabled={l.qty >= l.stock} onClick={() => setQty(l.id, l.qty + 1)} className="w-7 h-7 rounded-full text-white flex items-center justify-center disabled:opacity-30" style={{ background: BLUE_GRAD }}><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3">
              <button onClick={() => { setShowCart(false); setShowConfirm(true); }} className="w-full py-3 rounded-xl text-white font-medium" style={{ background: BLUE_GRAD }}>下一步</button>
            </div>
          </div>
        </div>
      )}

      {/* 出库确认（领用人/椅位/类型/备注） */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShowConfirm(false)}>
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">确认出库</span>
              <X className="w-5 h-5 text-gray-400" onClick={() => setShowConfirm(false)} />
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1.5">出库类型</div>
                <div className="flex gap-2">
                  {BIZ_TYPES.map((b) => (
                    <button key={b.key} onClick={() => setBizType(b.key)}
                      className={`px-4 py-1.5 rounded-full text-xs ${bizType === b.key ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={bizType === b.key ? { background: BLUE_GRAD } : undefined}>{b.label}</button>
                  ))}
                </div>
              </div>
              {bizType === "use" && (
                <>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">领用人</div>
                    <div className="flex flex-wrap gap-2">
                      {(membersQuery.data || []).map((m) => (
                        <button key={m.userId} onClick={() => setReceiverId(receiverId === m.userId ? null : m.userId)}
                          className={`px-3 py-1.5 rounded-full text-xs ${receiverId === m.userId ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500"}`}>{m.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">椅位 / 诊室</div>
                    <input value={chair} onChange={(e) => setChair(e.target.value)} placeholder="如 1号椅（选填）"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
                  </div>
                </>
              )}
              <div>
                <div className="text-xs text-gray-500 mb-1.5">备注</div>
                <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="选填"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                共 {totalKinds} 种 / {totalQty} 件，系统按「先到效期先出」自动扣减批次。
              </div>
            </div>
            <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100">
              <button onClick={submit} disabled={outbound.isPending}
                className="w-full py-3 rounded-xl text-white font-medium flex items-center justify-center" style={{ background: BLUE_GRAD }}>
                {outbound.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-1.5" />确认出库</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
