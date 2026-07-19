// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation, useSearch } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Package, BookOpen, Heart, Wallet, Users,
  ShoppingCart, Trash2, User, ChevronRight,
  TrendingUp, Copy, ArrowUpRight, ArrowDownLeft,
  Settings, MapPin, Truck, ExternalLink
} from "lucide-react";
import AddressBook from "./AddressBook";

// ─── 状态映射 ─────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: "待处理", color: "text-amber-600 bg-amber-50" },
  processing: { label: "处理中", color: "text-blue-600 bg-blue-50" },
  confirmed:  { label: "已确认", color: "text-blue-600 bg-blue-50" },
  packing:    { label: "打包中", color: "text-purple-600 bg-purple-50" },
  shipped:    { label: "已发货", color: "text-green-600 bg-green-50" },
  delivered:  { label: "已送达", color: "text-gray-500 bg-gray-100" },
  cancelled:  { label: "已取消", color: "text-red-500 bg-red-50" },
};

// ─── 我的订单 Tab ─────────────────────────────────────────────────────────────
function OrdersTab() {
  const { isAuthenticated } = useAuth();
  const { data: orders, isLoading } = mtrpc.order.myOrders.useQuery(undefined, { enabled: isAuthenticated });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
    </div>
  );

  if (!orders?.length) return (
    <div className="flex flex-col items-center py-16 text-center">
      <Package className="w-10 h-10 mb-3 text-gray-200" />
      <p className="text-[13px] text-gray-400 mb-5">还没有订单记录</p>
      <Link href="/p/proj_hzxm2t/diy">
        <button className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform" style={{ background: "#FF6900" }}>
          去 DIY 工坊下单
        </button>
      </Link>
    </div>
  );

  return (
    <div className="space-y-4">
      {(orders ?? []).map((order: any) => {
        const status = STATUS_MAP[order.status] ?? { label: order.status, color: "text-gray-500 bg-gray-100" };
        const ingredients: any[] = (() => { try { return JSON.parse(order.ingredients ?? "[]"); } catch { return []; } })();
        const hasTracking = !!(order.trackingNo || order.trackingNumber);
        const trackingNo = order.trackingNo || order.trackingNumber || "";
        const trackingCompany = order.trackingCompany || "";
        // 快递100公司代码映射
        const companyCodeMap: Record<string, string> = {
          "顺丰": "shunfeng", "SF": "shunfeng", "圆通": "yuantong", "中通": "zhongtong",
          "韵达": "yunda", "申通": "shentong", "邮政": "youzhengguonei", "EMS": "ems",
          "京东": "jd", "极兔": "jtexpress", "菜鸟": "cainiao",
        };
        const companyCode = Object.entries(companyCodeMap).find(([k]) => trackingCompany.includes(k))?.[1] ?? "";
        const trackingUrl = companyCode
          ? `https://www.kuaidi100.com/chaxun?com=${companyCode}&nu=${trackingNo}`
          : `https://www.kuaidi100.com/chaxun?nu=${trackingNo}`;

        return (
          <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            {/* ── 顶部状态栏 ── */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-[11px] text-gray-400 font-mono">订单号 {order.orderNo || `#${order.id}`}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${status.color}`}>
                {status.label}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {/* ── 配方名称 + 下单时间 ── */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-bold text-black leading-tight">{order.recipeName || "定制米"}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[18px] font-bold leading-tight" style={{ color: "#FF6900" }}>¥{Number(order.totalPrice).toFixed(2)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{order.totalWeightJin} 斤</p>
                </div>
              </div>

              {/* ── 米种配比可视化 ── */}
              {ingredients.length > 0 && (() => {
                // 计算每种米的百分比
                const totalW = ingredients.reduce((s: number, ing: any) => s + (ing.weightJin || 0), 0) || Number(order.totalWeightJin) || 1;
                const slices = ingredients.map((ing: any) => ({
                  ...ing,
                  pct: ing.percentage ?? Math.round((ing.weightJin / totalW) * 100),
                  color: ing.colorHex ?? "#C8A87A",
                }));
                // 生成SVG饼图路径
                const R = 44; const cx = 52; const cy = 52;
                let cumAngle = -Math.PI / 2;
                const paths = slices.map((s: any) => {
                  const angle = (s.pct / 100) * 2 * Math.PI;
                  const x1 = cx + R * Math.cos(cumAngle);
                  const y1 = cy + R * Math.sin(cumAngle);
                  cumAngle += angle;
                  const x2 = cx + R * Math.cos(cumAngle);
                  const y2 = cy + R * Math.sin(cumAngle);
                  const large = angle > Math.PI ? 1 : 0;
                  const d = slices.length === 1
                    ? `M ${cx} ${cy} m -${R} 0 a ${R} ${R} 0 1 1 ${R * 2} 0 a ${R} ${R} 0 1 1 -${R * 2} 0`
                    : `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
                  return { ...s, d };
                });
                return (
                  <div className="flex items-center gap-4">
                    {/* SVG 饼图 */}
                    <div className="flex-shrink-0">
                      <svg width="104" height="104" viewBox="0 0 104 104">
                        {paths.map((p: any, i: number) => (
                          <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="1.5" />
                        ))}
                        {/* 中心白圆（甜甜圈效果） */}
                        <circle cx={cx} cy={cy} r="22" fill="white" />
                        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="9" fill="#999" fontFamily="system-ui">总计</text>
                        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#333" fontFamily="system-ui">{totalW}斤</text>
                      </svg>
                    </div>
                    {/* 图例列表 */}
                    <div className="flex-1 space-y-1.5 min-w-0">
                      {slices.map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-[12px] text-gray-700 flex-1 truncate">{s.name}</span>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{s.weightJin}斤</span>
                          <span className="text-[11px] font-bold flex-shrink-0 w-8 text-right" style={{ color: s.color }}>{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── 收货信息 ── */}
              {order.receiverName && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[11px] font-semibold text-gray-500">收货信息</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-800">{order.receiverName}</span>
                    <span className="text-[12px] text-gray-500">{order.receiverPhone}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 leading-relaxed">{order.receiverAddress}</p>
                </div>
              )}

              {/* ── 备注 ── */}
              {order.userNote && (
                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">备注：</span>
                  <span className="text-[12px] text-gray-600">{order.userNote}</span>
                </div>
              )}

              {/* ── 物流信息 ── */}
              {hasTracking ? (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-green-500" />
                    <div>
                      <span className="text-[12px] font-medium text-gray-700">{trackingCompany || "快递"}</span>
                      <span className="text-[11px] text-gray-400 ml-1.5 font-mono">{trackingNo}</span>
                    </div>
                  </div>
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                    style={{ background: "#FF6900" }}
                  >
                    查物流 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                order.status !== "cancelled" && order.status !== "delivered" && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                    <Truck className="w-3.5 h-3.5 text-gray-300" />
                    <span className="text-[11px] text-gray-400">暂无物流信息，配货完成后将更新</span>
                  </div>
                )
              )}

              {/* ── 管理员备注 ── */}
              {order.adminNote && (
                <div className="bg-amber-50 rounded-xl px-3 py-2 flex items-start gap-1.5">
                  <span className="text-[11px] text-amber-600 font-semibold flex-shrink-0">客服备注：</span>
                  <span className="text-[11px] text-amber-700">{order.adminNote}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 我的配方 Tab ─────────────────────────────────────────────────────────────
function RecipesTab() {
  const { isAuthenticated } = useAuth();
  const { data: recipes, isLoading, refetch } = mtrpc.recipe.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteMutation = mtrpc.recipe.delete.useMutation({
    onSuccess: () => { toast.success("配方已删除"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
    </div>
  );

  if (!recipes?.length) return (
    <div className="flex flex-col items-center py-16 text-center">
      <BookOpen className="w-10 h-10 mb-3 text-gray-200" />
      <p className="text-[13px] text-gray-400 mb-5">还没有保存任何配方</p>
      <Link href="/p/proj_hzxm2t/diy">
        <button className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform" style={{ background: "#FF6900" }}>
          去 DIY 工坊创建
        </button>
      </Link>
    </div>
  );

  return (
    <div className="space-y-3">
      {(recipes ?? []).map((recipe: any) => {
        const ingredients: any[] = (() => { try { return JSON.parse(recipe.ingredients ?? "[]"); } catch { return []; } })();
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
                <Link href={`/p/proj_hzxm2t/diy`}>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform" style={{ background: "#FF6900" }}>
                    <ShoppingCart className="w-3 h-3" />再次购买
                  </button>
                </Link>
                <button onClick={() => deleteMutation.mutate({ id: recipe.id })} className="p-1.5 text-gray-300 active:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {ingredients.length > 0 && (
              <div>
                <div className="h-2 rounded-full overflow-hidden flex mb-2">
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
  );
}

// ─── 我的收藏 Tab ─────────────────────────────────────────────────────────────
function FavoritesTab() {
  const { isAuthenticated } = useAuth();
  const { data: savedRecipes, isLoading, refetch } = mtrpc.savedRecipes.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteSaved = mtrpc.savedRecipes.delete.useMutation({
    onSuccess: () => { toast.success("已取消收藏"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const addToCart = mtrpc.cart.addBatch.useMutation({
    onSuccess: () => toast.success("已加入购物车"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
  );

  if (!savedRecipes?.length) return (
    <div className="flex flex-col items-center py-16 text-center">
      <Heart className="w-10 h-10 mb-3 text-gray-200" />
      <p className="text-[13px] text-gray-400 mb-5">还没有收藏任何配方</p>
      <p className="text-[11px] text-gray-300">在购物车中点击收藏按钮保存配方</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {(savedRecipes ?? []).map((recipe: any) => {
        const items: any[] = (() => { try { return JSON.parse(recipe.items ?? "[]"); } catch { return []; } })();
        const preferences: string[] = (() => { try { return JSON.parse(recipe.preferences ?? "[]"); } catch { return []; } })();
        return (
          <div key={recipe.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="text-[15px] font-bold text-black">{recipe.recipeName || "收藏配方"}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(recipe.savedAt).toLocaleDateString("zh-CN")} 收藏
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!items.length) return;
                    addToCart.mutate({
                      recipeName: recipe.recipeName,
                      recipeId: recipe.recipeId,
                      items: items.map((it: any) => ({
                        riceId: it.riceId, riceName: it.riceName,
                        weightJin: it.weightJin ?? 2, pricePerJin: it.pricePerJin ?? 8,
                        ratio: it.ratio ?? 0,
                      })),
                    });
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                  style={{ background: "#FF6900" }}
                >
                  <ShoppingCart className="w-3 h-3" />加购
                </button>
                <button onClick={() => deleteSaved.mutate({ id: recipe.id })} className="p-1.5 text-gray-300 active:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {items.map((it: any, i: number) => (
                  <span key={i} className="text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100">
                    {it.riceName} {it.ratio}%
                  </span>
                ))}
              </div>
            )}
            {preferences.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {preferences.map((p: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,105,0,0.08)", color: "#FF6900" }}>
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 我的钱包 Tab ─────────────────────────────────────────────────────────────
function WalletTab() {
  const { isAuthenticated } = useAuth();
  const { data: usdtBalance, isLoading: balanceLoading } = trpc.recharge.getBalance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: cnyBalance, isLoading: cnyLoading } = trpc.recharge.getCnyBalance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: history, isLoading: historyLoading } = trpc.recharge.getBalanceHistory.useQuery({ limit: 20 }, { enabled: isAuthenticated });
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 10000, staleTime: 5000 });

  const usdtNum = Number(usdtBalance ?? 0);
  const cnyNum = Number(cnyBalance ?? 0);
  const usdtRate = cryptoPrices?.usdtCnyRate ?? 7.3;
  const totalCny = cnyNum + usdtNum * usdtRate;
  const isLoading = balanceLoading || cnyLoading;

  return (
    <div className="space-y-4">
      {/* 余额卡片 */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, #FF6900 0%, #FF8C00 100%)" }}>
        <p className="text-[12px] text-white/70 mb-1">钱包可用余额</p>
        {isLoading ? (
          <div className="h-10 w-32 bg-white/20 rounded-xl animate-pulse" />
        ) : (
          <>
            <p className="text-[36px] font-bold leading-none">
              ¥<span>{totalCny.toFixed(2)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {usdtNum > 0 && (
                <span className="text-[11px] text-white/80 bg-white/15 rounded-full px-2 py-0.5">
                  {usdtNum.toFixed(4)} USDT × {usdtRate.toFixed(2)} = ¥{(usdtNum * usdtRate).toFixed(2)}
                </span>
              )}
              {cnyNum > 0 && (
                <span className="text-[11px] text-white/80 bg-white/15 rounded-full px-2 py-0.5">
                  CNY ¥{cnyNum.toFixed(2)}
                </span>
              )}
            </div>
          </>
        )}
        <p className="text-[11px] text-white/50 mt-2">脉动网共享钱包 · 实时汇率折算 · 可用于米伴下单</p>
      </div>

      {/* 操作按钮 */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/recharge?returnTo=${encodeURIComponent('/p/proj_hzxm2t/my-orders?tab=wallet')}`}>
          <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#FF6900] text-[13px] font-semibold active:scale-95 transition-transform" style={{ color: "#FF6900" }}>
            <ArrowDownLeft className="w-4 h-4" />充值
          </button>
        </Link>
        <Link href={`/recharge?returnTo=${encodeURIComponent('/p/proj_hzxm2t/my-orders?tab=wallet')}`}>
          <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-50 text-gray-600 text-[13px] font-semibold active:scale-95 transition-transform border border-gray-100">
            <ArrowUpRight className="w-4 h-4" />提现
          </button>
        </Link>
      </div>

      {/* 收支记录 */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">最近收支</h3>
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !history?.length ? (
          <div className="text-center py-10">
            <Wallet className="w-8 h-8 mx-auto mb-2 text-gray-200" />
            <p className="text-[12px] text-gray-400">暂无收支记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(history ?? []).map((item: any, i: number) => {
              const isIncome = Number(item.amount) > 0;
              return (
                <div key={i} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isIncome ? "bg-green-50" : "bg-red-50"}`}>
                    {isIncome
                      ? <ArrowDownLeft className="w-4 h-4 text-green-500" />
                      : <ArrowUpRight className="w-4 h-4 text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{item.remark || (isIncome ? "收入" : "支出")}</p>
                    <p className="text-[11px] text-gray-400">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString("zh-CN") : ""}
                    </p>
                  </div>
                  <span className={`text-[15px] font-bold flex-shrink-0 ${isIncome ? "text-green-500" : "text-red-400"}`}>
                    {isIncome ? "+" : ""}¥{Math.abs(Number(item.amount)).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 团队业绩 Tab（仅团队长/业务员/管理员可见）─────────────────────────────
function TeamTab() {
  const { data: stats, isLoading: statsLoading } = mtrpc.agent.myMonthlyStats.useQuery();
  const { data: commissions, isLoading: commissionsLoading } = mtrpc.agent.myCommissions.useQuery();
  const { data: referrals, isLoading: referralsLoading } = mtrpc.agent.myReferrals.useQuery();
  const { data: inviteInfo } = mtrpc.invite.getMyInviteInfo.useQuery();
  const { data: qrCodeData } = mtrpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfo?.inviteCode ?? "" },
    { enabled: !!inviteInfo?.inviteCode }
  );

  const inviteLink = inviteInfo?.inviteLink ?? (inviteInfo?.inviteCode ? `https://jiangyuchen.cn/login?invite=${inviteInfo.inviteCode}` : "");

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => toast.success("邀请链接已复制"));
  }

  return (
    <div className="space-y-4">
      {/* 本月收益统计 */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 text-white" style={{ background: "#FF6900" }}>
            <p className="text-[11px] text-white/70 mb-1">本月总佣金</p>
            <p className="text-[22px] font-bold">¥{Number(stats?.totalCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">待结算</p>
            <p className="text-[22px] font-bold text-amber-500">¥{Number(stats?.pendingCommission ?? 0).toFixed(2)}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">订单完成后结算</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">已结算</p>
            <p className="text-[22px] font-bold text-green-500">¥{Number(stats?.settledCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">本月订单数</p>
            <p className="text-[22px] font-bold text-gray-800">{stats?.orderCount ?? 0}<span className="text-[13px] font-normal text-gray-400 ml-1">单</span></p>
          </div>
        </div>
      )}

      {/* 邀请码 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-start gap-4 mb-3">
          {/* 二维码 */}
          <div className="flex-shrink-0">
            {qrCodeData?.qrCodeDataUrl ? (
              <img src={qrCodeData.qrCodeDataUrl} alt="邀请二维码" className="w-20 h-20 rounded-xl border border-gray-100" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                <Skeleton className="w-20 h-20 rounded-xl" />
              </div>
            )}
          </div>
          {/* 邀请码 + 人数 */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 mb-1">我的邀请码</p>
            <p className="text-[26px] font-mono font-bold tracking-[0.2em] leading-none mb-2" style={{ color: "#FF6900" }}>
              {inviteInfo?.inviteCode ?? "——"}
            </p>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Users className="w-3.5 h-3.5" />
              已推荐 <span className="font-semibold text-gray-700">{inviteInfo?.inviteCount ?? 0}</span> 人
            </div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <p className="text-[11px] text-gray-400 flex-1 truncate">{inviteLink || "生成中…"}</p>
          <button onClick={copyLink} className="flex items-center gap-1 text-[12px] font-semibold flex-shrink-0 active:scale-95 transition-transform" style={{ color: "#FF6900" }}>
            <Copy className="w-3.5 h-3.5" />复制链接
          </button>
        </div>
      </div>

      {/* 推荐用户列表 */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">推荐用户 {referrals ? `(${referrals.length})` : ""}</h3>
        {referralsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : !referrals?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无推荐用户</div>
        ) : (
          <div className="space-y-2">
            {referrals.map((u: any) => (
              <div key={u.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: "#FF6900" }}>
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-[11px] text-gray-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString("zh-CN") : ""} 加入
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-gray-400">已推荐</p>
                  <p className="text-[13px] font-medium text-gray-600">{u.inviteCount} 人</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 佣金明细 */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">佣金明细 {commissions ? `(${commissions.length})` : ""}</h3>
        {commissionsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !commissions?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无佣金记录</div>
        ) : (
          <div className="space-y-2">
            {commissions.map((c: any) => (
              <div key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] text-gray-400 font-mono">{c.orderNo}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    c.status === "settled" ? "bg-green-50 text-green-600"
                    : c.status === "cancelled" ? "bg-red-50 text-red-500"
                    : "bg-amber-50 text-amber-600"
                  }`}>
                    {c.status === "settled" ? "已结算" : c.status === "cancelled" ? "已取消" : "待结算"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400">
                    订单 ¥{Number(c.orderAmount).toFixed(2)} · 比例 {(Number(c.commissionRate) * 100).toFixed(1)}%
                  </p>
                  <p className="text-[15px] font-bold" style={{ color: "#FF6900" }}>
                    +¥{Number(c.commissionAmount).toFixed(2)}
                  </p>
                </div>
                <p className="text-[10px] text-gray-300 mt-1">
                  {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
type TabKey = "orders" | "recipes" | "favorites" | "wallet" | "team" | "address";


export default function MyOrders() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialTab = (new URLSearchParams(search).get('tab') as TabKey) || 'orders';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // 是否显示团队业绩 Tab（业务员/团队长/管理员）
  const showTeamTab = (user as any)?.mibanRole === "parent" || (user as any)?.username === "jiang";
  const isAdmin = (user as any)?.username === "jiang";

  if (!isAuthenticated) {
    return (
      <div className="bg-white min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#FF6900" }}>
          <User className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-[22px] font-bold text-black mb-2">我的</h1>
        <p className="text-[13px] text-gray-400 mb-8">登录后查看订单、配方、钱包等信息</p>
        <button
          onClick={() => window.location.href = "/login"}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-semibold text-white active:scale-95 transition-transform"
          style={{ background: "#FF6900" }}
        >
          <User className="w-4 h-4" />登录后查看
        </button>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "orders",    label: "订单",   icon: <Package className="w-4 h-4" /> },
    { key: "recipes",   label: "配方",   icon: <BookOpen className="w-4 h-4" /> },
    { key: "favorites", label: "收藏",   icon: <Heart className="w-4 h-4" /> },
    { key: "wallet",    label: "钱包",   icon: <Wallet className="w-4 h-4" /> },
    ...(showTeamTab ? [{ key: "team" as TabKey, label: "团队", icon: <Users className="w-4 h-4" /> }] : []),
    { key: "address" as TabKey, label: "地址", icon: <MapPin className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-[#F8F6F3] min-h-screen">
      {/* Tab 导航 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-gray-100">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: activeTab === tab.key ? "#fff" : "transparent",
                color: activeTab === tab.key ? "#FF6900" : "#888",
                boxShadow: activeTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="px-4 py-4 pb-24">
        {activeTab === "orders"    && <OrdersTab />}
        {activeTab === "recipes"   && <RecipesTab />}
        {activeTab === "favorites" && <FavoritesTab />}
        {activeTab === "wallet"    && <WalletTab />}
        {activeTab === "team"      && showTeamTab && <TeamTab />}
        {activeTab === "address"   && <AddressBook mode="manage" />}
      </div>
    </div>
  );
}
