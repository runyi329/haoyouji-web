// @ts-nocheck
import { useState, useEffect } from "react";
import { ShoppingCart, X, Trash2, ChevronRight, Package, Heart, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";

function getSessionId() {
  const key = "miban_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

// 按 recipeId/recipeName 分组
function groupItems(items: CartItem[]) {
  const groups: Record<string, CartItem[]> = {};
  for (const item of items) {
    const key = item.recipeId ?? item.recipeName ?? "自定义配方";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups);
}

type CartItem = {
  id: number;
  riceId: string;
  riceName: string;
  weightJin: string;
  pricePerJin: string;
  ratio: number;
  recipeId: string | null;
  recipeName: string | null;
};

export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => getSessionId());
  const [savedGroups, setSavedGroups] = useState<Set<string>>(new Set());
  const { isAuthenticated } = useAuth();

  const cartList = mtrpc.cart.list.useQuery(
    { sessionId },
    { refetchOnWindowFocus: true, refetchInterval: open ? 5000 : false }
  );
  const removeItem = mtrpc.cart.remove.useMutation({
    onSuccess: () => cartList.refetch(),
  });
  const clearCart = mtrpc.cart.clear.useMutation({
    onSuccess: () => cartList.refetch(),
  });
  const saveRecipe = mtrpc.savedRecipes.save.useMutation({
    onSuccess: (_, variables) => {
      setSavedGroups(prev => new Set(Array.from(prev).concat(variables.recipeName)));
    },
  });

  const items = cartList.data ?? [];
  const cartCount = items.length;

  // 计算总价
  const totalPrice = items.reduce((sum, item) => {
    return sum + Number(item.weightJin) * Number(item.pricePerJin);
  }, 0);

  // 计算总重量
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weightJin), 0);

  const groups = groupItems(items);

  return (
    <>
      {/* ─── 购物车图标按钮 ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="relative w-8 h-8 flex items-center justify-center active:opacity-70"
        aria-label="购物车"
      >
        <ShoppingCart className="w-5 h-5 text-black" strokeWidth={1.8} />
        {cartCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-0.5"
            style={{ background: "#FF6900" }}
          >
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>

      {/* ─── 遮罩 ───────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── 侧边抽屉 ───────────────────────────────────────────── */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[70] flex flex-col bg-white shadow-2xl"
        style={{
          width: "min(360px, 92vw)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.23,1,0.32,1)",
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#FF6900]" />
            <span className="text-[16px] font-bold text-black">购物车</span>
            {cartCount > 0 && (
              <span className="text-[12px] text-gray-400">{cartCount} 件</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {cartCount > 0 && (
              <button
                onClick={() => clearCart.mutate({ sessionId })}
                disabled={clearCart.isPending}
                className="text-[12px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center active:scale-95 transition-transform"
            >
              <X className="w-4 h-4 text-black/60" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {cartList.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[#FF6900] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : cartCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center">
                <Package className="w-8 h-8 text-orange-200" />
              </div>
              <p className="text-[14px] text-gray-400">购物车还是空的</p>
              <button
                onClick={() => { setOpen(false); window.location.href = "/p/proj_hzxm2t/diy"; }}
                className="text-[13px] text-[#FF6900] font-medium flex items-center gap-1"
              >
                去配米 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-4">
              {groups.map(([groupKey, groupItems]) => {
                const groupName = groupItems[0]?.recipeName ?? "自定义配方";
                const groupWeight = groupItems.reduce((s, i) => s + Number(i.weightJin), 0);
                const groupPrice = groupItems.reduce((s, i) => s + Number(i.weightJin) * Number(i.pricePerJin), 0);
                return (
                  <div key={groupKey} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {/* 配方标题 */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5">
                      <div>
                        <span className="text-[13px] font-semibold text-black">{groupName}</span>
                        <span className="text-[11px] text-gray-400 ml-2">{groupWeight.toFixed(1)}斤 · ¥{groupPrice.toFixed(1)}</span>
                      </div>
                      {/* 收藏按钮 */}
                      <button
                        onClick={() => {
                          if (!isAuthenticated) { window.location.href = "/login"; return; }
                          if (savedGroups.has(groupName)) return;
                          saveRecipe.mutate({
                            recipeName: groupName,
                            purpose: "rice",
                            preferences: [],
                            items: groupItems.map(i => ({
                              riceId: i.riceId,
                              riceName: i.riceName,
                              ratio: i.ratio,
                              pricePerJin: i.pricePerJin,
                            })),
                          });
                        }}
                        disabled={saveRecipe.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95"
                        style={{
                          background: savedGroups.has(groupName) ? "#FFF3E8" : "#F5F5F5",
                          color: savedGroups.has(groupName) ? "#FF6900" : "#888",
                        }}
                      >
                        {savedGroups.has(groupName)
                          ? <><Check className="w-3 h-3" />已收藏</>
                          : <><Heart className="w-3 h-3" />收藏</>
                        }
                      </button>
                    </div>
                    {/* 米种列表 */}
                    <div className="divide-y divide-black/5">
                      {groupItems.map((item) => (
                        <div key={item.id} className="flex items-center px-4 py-2.5 gap-3">
                          {/* 米种色块 */}
                          <div
                            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: getRiceColor(item.riceId) }}
                          >
                            {item.riceName.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-black">{item.riceName}</p>
                            <p className="text-[11px] text-gray-400">
                              {Number(item.weightJin).toFixed(1)}斤 · ¥{Number(item.pricePerJin).toFixed(1)}/斤
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold text-black">
                              ¥{(Number(item.weightJin) * Number(item.pricePerJin)).toFixed(1)}
                            </p>
                            <p className="text-[10px] text-[#FF6900]">{item.ratio}%</p>
                          </div>
                          <button
                            onClick={() => removeItem.mutate({ id: item.id })}
                            disabled={removeItem.isPending}
                            className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center active:scale-95 transition-transform ml-1 flex-shrink-0"
                          >
                            <X className="w-3 h-3 text-black/40" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部结算栏 */}
        {cartCount > 0 && (
          <div className="border-t border-black/8 px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[12px] text-gray-400">共 {cartCount} 件 · {totalWeight.toFixed(1)}斤</span>
              </div>
              <div className="text-right">
                <span className="text-[12px] text-gray-400">合计 </span>
                <span className="text-[18px] font-bold text-black">¥{totalPrice.toFixed(1)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                if (!isAuthenticated) {
                  window.location.href = "/login";
                } else {
                  window.location.href = "/p/proj_hzxm2t/my-orders";
                }
              }}
              className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "#FF6900" }}
            >
              去结算 <ChevronRight className="w-4 h-4" />
            </button>
            {!isAuthenticated && (
              <p className="text-center text-[11px] text-gray-400 mt-2">登录后可保存配方并下单</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// 根据 riceId 返回颜色
function getRiceColor(riceId: string): string {
  const colorMap: Record<string, string> = {
    white: "#E8DCC8",
    black: "#2D1B2E",
    red: "#8B3A3A",
    brown: "#8B6914",
    purple: "#4A2D6B",
    millet: "#D4A017",
    mung: "#4A7C59",
    coix: "#C8A87A",
  };
  return colorMap[riceId] ?? "#AAAAAA";
}
