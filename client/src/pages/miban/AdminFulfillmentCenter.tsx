import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import FulfillmentPanel from "./FulfillmentPanel";
import { fulfillmentCandidateFromOrder } from "./fulfillmentModel";

/** Separate logistics-only capability for verified system administrators.
 * Does not grant the legacy refund/delete/catalog/team panels to new actors. */
export default function AdminFulfillmentCenter({
  actorId,
}: {
  actorId: number;
}) {
  const orders = trpc.order.allOrders.useQuery(undefined, {
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const candidates = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return (orders.data ?? []).flatMap((value: unknown) => {
      const candidate = fulfillmentCandidateFromOrder(value);
      if (!candidate) return [];
      const raw = value as Record<string, unknown>;
      const created =
        raw.createdAt instanceof Date
          ? raw.createdAt
          : new Date(String(raw.createdAt ?? ""));
      if (status !== "all" && candidate.status !== status) return [];
      if (from && created < new Date(`${from}T00:00:00+08:00`)) return [];
      if (to && created > new Date(`${to}T23:59:59.999+08:00`)) return [];
      if (
        query &&
        ![
          candidate.orderNo,
          candidate.receiverName,
          candidate.receiverPhone,
          candidate.products,
          candidate.trackingNo ?? "",
        ].some(text => text.toLowerCase().includes(query))
      )
        return [];
      return [candidate];
    });
  }, [orders.data, keyword, status, from, to]);
  const scopeKey = JSON.stringify([
    "admin",
    actorId,
    keyword,
    status,
    from,
    to,
  ]);
  return (
    <div className="min-w-0 space-y-3">
      <p className="rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-700">
        系统管理员全订单物流中心。包括普通、未归属及已暂停供货商的授权订单；仅发货和更正，不提供退款、删除、商品修改或钱包操作。
      </p>
      <div className="min-w-0 space-y-3 rounded-2xl bg-white p-3">
        <label className="block text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Search className="h-3.5 w-3.5" />
            筛选订单号 / 收货人 / 商品 / 单号
          </span>
          <input
            value={keyword}
            maxLength={100}
            onChange={event => setKeyword(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border px-3 py-2 text-xs"
          />
        </label>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0 overflow-hidden text-xs text-gray-500">
            开始日期
            <input
              type="date"
              value={from}
              onChange={event => setFrom(event.target.value)}
              className="mt-1 w-full min-w-0 max-w-full appearance-none rounded-xl border px-2 py-2 text-xs"
            />
          </label>
          <label className="min-w-0 overflow-hidden text-xs text-gray-500">
            结束日期
            <input
              type="date"
              value={to}
              onChange={event => setTo(event.target.value)}
              className="mt-1 w-full min-w-0 max-w-full appearance-none rounded-xl border px-2 py-2 text-xs"
            />
          </label>
        </div>
        <label className="block text-xs text-gray-500">
          订单状态
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border px-3 py-2 text-xs"
          >
            {[
              ["all", "全部"],
              ["pending", "待确认"],
              ["confirmed", "已确认"],
              ["packing", "配货中"],
              ["shipped", "已发货"],
              ["delivered", "已收货"],
              ["cancelled", "已取消"],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {from && to && from > to ? (
        <p role="alert" className="text-xs text-red-600">
          开始日期不能晚于结束日期。
        </p>
      ) : orders.error ? (
        <div
          role="alert"
          className="space-y-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"
        >
          <p className="break-words">
            真实授权订单读取失败：{orders.error.message}
          </p>
          <button
            type="button"
            onClick={() => void orders.refetch()}
            className="rounded-lg border px-3 py-2"
          >
            重新读取
          </button>
        </div>
      ) : orders.isLoading ? (
        <p
          role="status"
          className="flex items-center gap-2 py-6 text-xs text-gray-500"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          读取真实授权订单…
        </p>
      ) : (
        <FulfillmentPanel
          key={scopeKey}
          orders={candidates}
          scopeKey={scopeKey}
          onChanged={() => void orders.refetch()}
        />
      )}
    </div>
  );
}
