/**
 * 牙伴齿科商城 - 领券中心 / 我的优惠券（客人端）
 * 路由：/yaban/shop/coupons
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Ticket } from "lucide-react";

type Tab = "claim" | "mine";

function fmtDate(val: any): string {
  if (!val) return "";
  return String(val).replace("T", " ").slice(0, 10);
}

function couponDesc(c: any): string {
  if (c.type === "discount" && c.discount != null) {
    const z = (Number(c.discount) * 10).toFixed(1).replace(/\.0$/, "");
    return `${z}折`;
  }
  return `满${Number(c.threshold)}减${Number(c.amount)}`;
}

export default function YabanShopCoupons() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("claim");
  const utils = trpc.useUtils();

  const claimable = trpc.yabanCoupon.listClaimable.useQuery(undefined, { enabled: tab === "claim" });
  const mine = trpc.yabanCoupon.myCoupons.useQuery(undefined, { enabled: tab === "mine" });

  const claim = trpc.yabanCoupon.claim.useMutation({
    onSuccess: () => { toast.success("领取成功"); utils.yabanCoupon.listClaimable.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const renderAmount = (c: any) => {
    if (c.type === "discount" && c.discount != null) {
      return (
        <div className="text-white">
          <span className="text-3xl font-bold">{(Number(c.discount) * 10).toFixed(1).replace(/\.0$/, "")}</span>
          <span className="text-sm">折</span>
        </div>
      );
    }
    return (
      <div className="text-white">
        <span className="text-sm">¥</span>
        <span className="text-3xl font-bold">{Number(c.amount)}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">优惠券</span>
        </div>
        <div className="flex gap-2 px-3 pb-3">
          <button onClick={() => setTab("claim")}
            className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "claim" ? "bg-white text-[#2196C8]" : "bg-white/20 text-white"}`}>
            领券中心
          </button>
          <button onClick={() => setTab("mine")}
            className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "mine" ? "bg-white text-[#2196C8]" : "bg-white/20 text-white"}`}>
            我的优惠券
          </button>
        </div>
      </div>

      <div className="px-3 pt-3 space-y-3">
        {tab === "claim" ? (
          claimable.isLoading ? (
            <Loading />
          ) : (claimable.data ?? []).length === 0 ? (
            <Empty text="暂无可领取的优惠券" />
          ) : (
            (claimable.data as any[]).map((c) => (
              <div key={c.id} className="bg-white rounded-2xl overflow-hidden flex">
                <div className="w-24 bg-gradient-to-br from-[#2196C8] to-[#3BA9E0] flex flex-col items-center justify-center py-4">
                  {renderAmount(c)}
                </div>
                <div className="flex-1 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{couponDesc(c)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">有效期 {c.valid_days} 天</p>
                  </div>
                  <button
                    onClick={() => claim.mutate({ couponId: c.id })}
                    disabled={claim.isPending}
                    className="px-4 py-1.5 rounded-full bg-[#E2452F] text-white text-sm shrink-0"
                  >领取</button>
                </div>
              </div>
            ))
          )
        ) : mine.isLoading ? (
          <Loading />
        ) : (mine.data ?? []).length === 0 ? (
          <Empty text="还没有优惠券，去领券中心看看" />
        ) : (
          (mine.data as any[]).map((c) => {
            const used = c.status !== "unused";
            return (
              <div key={c.uc_id} className={`bg-white rounded-2xl overflow-hidden flex ${used ? "opacity-60" : ""}`}>
                <div className={`w-24 flex flex-col items-center justify-center py-4 ${used ? "bg-gray-300" : "bg-gradient-to-br from-[#2196C8] to-[#3BA9E0]"}`}>
                  {renderAmount(c)}
                </div>
                <div className="flex-1 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{couponDesc(c)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">有效期至 {fmtDate(c.expire_at)}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {c.status === "unused" ? "未使用" : c.status === "used" ? "已使用" : "已过期"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...</div>;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <Ticket className="w-12 h-12 mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
