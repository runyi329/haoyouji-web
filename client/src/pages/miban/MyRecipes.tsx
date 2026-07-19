// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ShoppingCart, Trash2, User, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { useRef } from "react";

// 米种数据（用于海报颜色映射）
const RICE_TYPES_MAP: Record<string, { name: string; color: string }> = {
  white:  { name: "白米",  color: "#C8A87A" },
  black:  { name: "黑米",  color: "#2D1B2E" },
  red:    { name: "红米",  color: "#8B2020" },
  brown:  { name: "糙米",  color: "#A0785A" },
  purple: { name: "紫米",  color: "#4A2060" },
  millet: { name: "小米",  color: "#E8C840" },
  mung:   { name: "绿豆",  color: "#4A7C3F" },
  coix:   { name: "薏米",  color: "#C4956A" },
};

// 收藏配方海报组件
function SavedRecipePoster({ recipeName, items, preferences, purpose, aiReason }: {
  recipeName: string;
  items: Array<{ riceId: string; riceName: string; ratio: number }>;
  preferences: string[];
  purpose: string;
  aiReason?: string | null;
}) {
  const purposeLabel = purpose === "porridge" ? "煮粥" : "蒸饭";
  const sortedItems = [...items].sort((a, b) => b.ratio - a.ratio);
  return (
    <div style={{ background: "linear-gradient(145deg,#0A0A0A 0%,#1a1208 100%)", borderRadius: 24, padding: 28, width: "100%", fontFamily: "sans-serif", boxSizing: "border-box" }}>
      {/* 顶部品牌 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FF6900", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>米</span>
        </div>
        <span style={{ color: "white", fontSize: 16, fontWeight: 700 }}>米伴 · 我的配方</span>
        <span style={{ marginLeft: "auto", background: "rgba(255,105,0,0.15)", border: "1px solid rgba(255,105,0,0.4)", borderRadius: 20, padding: "2px 10px", color: "#FF6900", fontSize: 11 }}>
          {purposeLabel}
        </span>
      </div>
      {/* 配方名称 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{recipeName}</div>
      </div>
      {/* 饼图 */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", width: 100, height: 100 }}>
          <svg viewBox="0 0 36 36" style={{ width: 100, height: 100, transform: "rotate(-90deg)" }}>
            {(() => {
              let offset = 0;
              return sortedItems.map((item) => {
                const color = RICE_TYPES_MAP[item.riceId]?.color ?? "#ccc";
                const dash = item.ratio;
                const el = (
                  <circle key={item.riceId} cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.6"
                    strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={-offset} />
                );
                offset += dash;
                return el;
              });
            })()}
          </svg>
        </div>
      </div>
      {/* 配比标签 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 16 }}>
        {sortedItems.map((item) => {
          const color = RICE_TYPES_MAP[item.riceId]?.color ?? "#ccc";
          return (
            <div key={item.riceId} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
              <span style={{ color: "white", fontSize: 12 }}>{item.riceName}</span>
              <span style={{ color: "#FF6900", fontSize: 12, fontWeight: 700 }}>{item.ratio}%</span>
            </div>
          );
        })}
      </div>
      {/* 口感偏好 */}
      {preferences.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 14 }}>
          {preferences.map(p => (
            <span key={p} style={{ background: "rgba(255,105,0,0.15)", border: "1px solid rgba(255,105,0,0.35)", borderRadius: 20, padding: "2px 9px", color: "#FF9500", fontSize: 11 }}>{p}</span>
          ))}
        </div>
      )}
      {/* AI 推荐理由（如有） */}
      {aiReason && (
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ color: "#FF6900", fontSize: 11, marginBottom: 4 }}>✦ AI 推荐理由</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.6 }}>{aiReason}</div>
        </div>
      )}
      {/* 底部 */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, textAlign: "center" }}>
        <div style={{ color: "#444", fontSize: 11 }}>mibanrice.com · 按需定配 · 新鲜发货 · 健康有据</div>
      </div>
    </div>
  );
}

// 根据 riceId 返回颜色
function getRiceColor(riceId: string): string {
  const colorMap: Record<string, string> = {
    white: "#E8DCC8", black: "#2D1B2E", red: "#8B3A3A",
    brown: "#8B6914", purple: "#4A2D6B", millet: "#D4A017",
    mung: "#4A7C59", coix: "#C8A87A",
  };
  return colorMap[riceId] ?? "#AAAAAA";
}

export default function MyRecipes() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"recipes" | "saved">("recipes");
  // 海报相关状态
  const [showSharePoster, setShowSharePoster] = useState(false);
  const [sharePosterImg, setSharePosterImg] = useState<string | null>(null);
  const [sharingRecipe, setSharingRecipe] = useState<any>(null);
  const [generatingShare, setGeneratingShare] = useState(false);
  const sharePosterRef = useRef<HTMLDivElement>(null);

  const generateSharePoster = async (recipe: any) => {
    setSharingRecipe(recipe);
    setShowSharePoster(true);
    setSharePosterImg(null);
    setGeneratingShare(true);
    await new Promise(r => setTimeout(r, 400));
    if (sharePosterRef.current) {
      try {
        const canvas = await html2canvas(sharePosterRef.current, {
          scale: 2, backgroundColor: "#0A0A0A", useCORS: true, allowTaint: true, logging: false,
        });
        setSharePosterImg(canvas.toDataURL("image/png"));
      } catch (e) { console.error("海报生成失败", e); }
    }
    setGeneratingShare(false);
  };

  const downloadSharePoster = () => {
    if (!sharePosterImg) return;
    const a = document.createElement("a");
    a.href = sharePosterImg;
    a.download = `米伴配方-${sharingRecipe?.recipeName ?? "分享"}.png`;
    a.click();
  };

  const { data: recipes, isLoading, refetch } = mtrpc.recipe.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteMutation = mtrpc.recipe.delete.useMutation({
    onSuccess: () => { toast.success("配方已删除"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: savedRecipes, isLoading: savedLoading, refetch: refetchSaved } = mtrpc.savedRecipes.list.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const deleteSaved = mtrpc.savedRecipes.delete.useMutation({
    onSuccess: () => { toast.success("已取消收藏"); refetchSaved(); },
    onError: (e) => toast.error(e.message),
  });
  // 收藏米种
  const { data: favRiceList, refetch: refetchFavRice } = mtrpc.favorite.myList.useQuery(undefined, { enabled: isAuthenticated });
  const toggleFavRice = mtrpc.favorite.toggle.useMutation({
    onSuccess: () => { refetchFavRice(); toast.success("已取消收藏"); },
  });
  // 只取米种收藏（productKey 以 rice_ 开头）
  const favRices = (favRiceList ?? []).filter((f: any) => f.productKey?.startsWith("rice_"));
  const addToCart = mtrpc.cart.addBatch.useMutation({
    onSuccess: () => toast.success("已加入购物车"),
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) return (
    <div className="bg-white min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center mb-5">
        <BookOpen className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-[22px] font-bold text-black mb-2">我的配方</h1>
      <p className="text-[13px] text-gray-400 mb-8">登录后查看您保存的所有米种配方</p>
      <button
        onClick={() => window.location.href = "/login"}
        className="flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-semibold text-white active:scale-95 transition-transform"
        style={{ background: "#FF6900" }}
      >
        <User className="w-4 h-4" />
        登录后查看
      </button>
    </div>
  );

  return (
    <>
      <div className="bg-white min-h-screen">
      <div className="px-4 pt-4 pb-24">
        {/* Tab 切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
          <button
            onClick={() => setActiveTab("recipes")}
            className="flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              background: activeTab === "recipes" ? "#fff" : "transparent",
              color: activeTab === "recipes" ? "#000" : "#888",
              boxShadow: activeTab === "recipes" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            我的配方
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className="flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all flex items-center justify-center gap-1"
            style={{
              background: activeTab === "saved" ? "#fff" : "transparent",
              color: activeTab === "saved" ? "#FF6900" : "#888",
              boxShadow: activeTab === "saved" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            <Heart className="w-3.5 h-3.5" />
            收藏配方
            {savedRecipes && savedRecipes.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "#FF6900" }}>
                {savedRecipes.length}
              </span>
            )}
          </button>
        </div>

        {/* 我的配方 Tab */}
        {activeTab === "recipes" && (
          <>
            <p className="text-[12px] text-gray-400 mb-4">您保存的所有个性化米种配方</p>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
            ) : !recipes?.length ? (
              <div className="flex flex-col items-center py-16 text-center">
                <BookOpen className="w-10 h-10 mb-3 text-gray-200" />
                <p className="text-[13px] text-gray-400 mb-5">还没有保存任何配方</p>
                <Link href="/p/proj_hzxm2t/diy">
                  <button
                    className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
                    style={{ background: "#FF6900" }}
                  >
                    去 DIY 工坊创建
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recipes.map((recipe) => {
                  const ingredients: any[] = (() => {
                    try { return JSON.parse(recipe.ingredients as any ?? "[]"); }
                    catch { return []; }
                  })();
                  return (
                    <div key={recipe.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-[15px] font-bold text-black">{recipe.name}</h3>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {new Date(recipe.createdAt).toLocaleDateString("zh-CN")} 保存
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/diy?recipe=${recipe.id}`}>
                            <button
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                              style={{ background: "#FF6900" }}
                            >
                              <ShoppingCart className="w-3 h-3" />
                              再次购买
                            </button>
                          </Link>
                          <button
                            onClick={() => deleteMutation.mutate({ id: recipe.id })}
                            className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {ingredients.length > 0 && (
                        <div>
                          <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                            {ingredients.map((ing: any, i: number) => (
                              <div key={i} style={{ width: `${ing.percentage}%`, backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {ingredients.map((ing: any, i: number) => (
                              <span key={i} className="flex items-center gap-1 text-[11px] text-gray-400">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                                {ing.name} {ing.percentage}%
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {recipe.totalPricePerJin && (
                        <p className="text-[14px] font-bold mt-3" style={{ color: "#FF6900" }}>
                          ¥{Number(recipe.totalPricePerJin).toFixed(2)}<span className="text-[11px] font-normal text-gray-400">/斤</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 收藏配方 Tab */}
        {activeTab === "saved" && (
          <>
            {/* 收藏米种区 */}
            {favRices.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-gray-500 mb-2">收藏米种</h3>
                <div className="space-y-2">
                  {favRices.map((item: any) => (
                    <div key={item.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-gray-50">
                      {item.productImg ? (
                        <img src={item.productImg} alt={item.productName} className="w-14 h-14 rounded-xl object-contain flex-shrink-0" style={{ mixBlendMode: "multiply", background: "#F8F6F3" }} />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Heart className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-black truncate">{item.productName}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString("zh-CN")} 收藏</p>
                      </div>
                      <button
                        onClick={() => toggleFavRice.mutate({ productKey: item.productKey, productName: item.productName })}
                        className="p-1.5 text-red-400 active:text-red-600 transition-colors flex-shrink-0"
                      >
                        <Heart className="w-4 h-4" style={{ fill: "#FF3B30", color: "#FF3B30" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[12px] text-gray-400 mb-4">从购物车收藏的配比方案，一键加购</p>
            {savedLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
              </div>
            ) : !savedRecipes?.length ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Heart className="w-10 h-10 mb-3 text-gray-200" />
                <p className="text-[13px] text-gray-400 mb-2">还没有收藏任何配方</p>
                <p className="text-[11px] text-gray-300 mb-5">在购物车中点击「收藏」按钮保存配方</p>
                <Link href="/p/proj_hzxm2t/diy">
                  <button
                    className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
                    style={{ background: "#FF6900" }}
                  >
                    去配米工坊
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {savedRecipes.map((recipe) => {
                  const items: Array<{ riceId: string; riceName: string; ratio: number; pricePerJin: string }> = (() => {
                    try { return JSON.parse(recipe.items as string ?? "[]"); }
                    catch { return []; }
                  })();
                  const totalPrice = items.reduce((s, i) => s + Number(i.pricePerJin) * (i.ratio / 100), 0);
                  return (
                    <div key={recipe.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-[15px] font-bold text-black">{recipe.recipeName}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">
                              {recipe.purpose === "porridge" ? "🥣 煮粥" : "🍚 蒸饭"}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {new Date(recipe.createdAt).toLocaleDateString("zh-CN")} 收藏
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteSaved.mutate({ id: recipe.id })}
                          className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 比例条 */}
                      {items.length > 0 && (
                        <div className="mb-3">
                          <div className="h-2 rounded-full overflow-hidden flex mb-2">
                            {items.map((item, i) => (
                              <div key={i} style={{ width: `${item.ratio}%`, backgroundColor: getRiceColor(item.riceId) }} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {items.map((item, i) => (
                              <span key={i} className="flex items-center gap-1 text-[11px] text-gray-500">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getRiceColor(item.riceId) }} />
                                {item.riceName} {item.ratio}%
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 价格 + 加购按钮 */}
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[13px] font-bold" style={{ color: "#FF6900" }}>
                          ¥{totalPrice.toFixed(2)}<span className="text-[10px] font-normal text-gray-400">/斤均价</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => generateSharePoster(recipe)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold border border-gray-200 text-gray-600 active:scale-95 transition-transform"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            分享
                          </button>
                          <button
                            onClick={() => {
                              addToCart.mutate({
                                sessionId: localStorage.getItem("miban_session_id") ?? "",
                                recipeName: recipe.recipeName,
                                items: items.map(i => ({
                                  riceId: i.riceId,
                                  riceName: i.riceName,
                                  ratio: i.ratio,
                                  weightJin: parseFloat((5 * i.ratio / 100).toFixed(1)),
                                  pricePerJin: Number(i.pricePerJin),
                                })),
                              });
                            }}
                            disabled={addToCart.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white active:scale-95 transition-transform"
                            style={{ background: "#FF6900" }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            一键加购 5斤
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>

      {/* 分享海报弹窗 */}
    {showSharePoster && sharingRecipe && (() => {
      const posterItems: Array<{ riceId: string; riceName: string; ratio: number }> = (() => {
        try { return JSON.parse(sharingRecipe.items ?? "[]"); }
        catch { return []; }
      })();
      const posterPrefs: string[] = (() => {
        try { return JSON.parse(sharingRecipe.preferences ?? "[]"); }
        catch { return []; }
      })();
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => { setShowSharePoster(false); setSharePosterImg(null); }}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-3xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {sharePosterImg ? (
              <img src={sharePosterImg} alt="分享海报" className="w-full rounded-2xl" />
            ) : (
              <div ref={sharePosterRef} className="w-full">
                <SavedRecipePoster
                  recipeName={sharingRecipe.recipeName}
                  items={posterItems}
                  preferences={posterPrefs}
                  purpose={sharingRecipe.purpose ?? "rice"}
                  aiReason={sharingRecipe.aiReason}
                />
              </div>
            )}
            <div className="flex gap-3 mt-4 px-1">
              <button
                onClick={() => { setShowSharePoster(false); setSharePosterImg(null); }}
                className="flex-1 py-3 rounded-2xl text-[14px] font-semibold text-white border border-white/20"
              >关闭</button>
              {sharePosterImg ? (
                <button
                  onClick={downloadSharePoster}
                  className="flex-1 py-3 rounded-2xl text-[14px] font-semibold text-white"
                  style={{ background: "#FF6900" }}
                >保存图片</button>
              ) : (
                <button
                  disabled={generatingShare}
                  className="flex-1 py-3 rounded-2xl text-[14px] font-semibold text-white"
                  style={{ background: generatingShare ? "#999" : "#FF6900" }}
                >{generatingShare ? "生成中..." : "生成海报"}</button>
              )}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
