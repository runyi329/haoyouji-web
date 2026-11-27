import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Truck } from "lucide-react";
import type { LogisticsDetails as LogisticsResponse } from "@shared/miban-logistics";
import { mtrpc } from "./mibanTrpc";

export interface LogisticsDetailsProps {
  orderId: number;
  trackingCompany: string;
  trackingNo: string;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function LogisticsDetails({ orderId, trackingCompany, trackingNo }: LogisticsDetailsProps) {
  // 仅在展开时挂载；先保留浏览器时间线，再读取服务端最新推送缓存。
  // 半小时承运商限频在服务端执行，不轮询，也不随焦点/重连重查。
  const query = mtrpc.order.logistics.useQuery(
    { orderId, trackingVersion: `${trackingCompany}:${trackingNo}` },
    {
      staleTime: 0,
      gcTime: 30 * 60 * 1000,
      refetchOnMount: true,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  const data = query.data as LogisticsResponse | undefined;
  const [cooldownClock, setCooldownClock] = useState(() => Date.now());
  const previousTimeline = useRef<{
    orderId: number;
    trackingCompany: string;
    trackingNo: string;
    data: LogisticsResponse | null;
  }>({ orderId, trackingCompany, trackingNo, data: null });

  // 查询失败或返回提示消息时，不让已有时间线被空结果替换。
  useEffect(() => {
    if (previousTimeline.current.orderId !== orderId || previousTimeline.current.trackingNo !== trackingNo || previousTimeline.current.trackingCompany !== trackingCompany) {
      previousTimeline.current = { orderId, trackingCompany, trackingNo, data: null };
    }
    if (data?.records?.length) previousTimeline.current.data = data;
  }, [data, orderId, trackingNo, trackingCompany]);

  const previousData = previousTimeline.current.orderId === orderId && previousTimeline.current.trackingNo === trackingNo && previousTimeline.current.trackingCompany === trackingCompany
    ? previousTimeline.current.data
    : null;
  const timelineData = data?.records?.length ? data : (data?.message || query.isError) ? previousData : data;
  const records = useMemo(() => {
    // 正常 DTO 为最新在前；对可解析的时间再做稳定降序，且不修改缓存原数组。
    return [...(timelineData?.records ?? [])].sort((a, b) => {
      const aTime = new Date(a.time).getTime();
      const bTime = new Date(b.time).getTime();
      return Number.isFinite(aTime) && Number.isFinite(bTime) ? bTime - aTime : 0;
    });
  }, [timelineData]);

  const retryAt = data?.canRetryAt ? new Date(data.canRetryAt).getTime() : NaN;
  const retryBlocked = Number.isFinite(retryAt) && retryAt > cooldownClock;
  useEffect(() => {
    const now = Date.now();
    setCooldownClock(now);
    if (!Number.isFinite(retryAt) || retryAt <= now) return;
    // 一次性到期解锁 UI，不用倒计时轮询，不会触发网络请求。
    const timeout = window.setTimeout(() => setCooldownClock(Date.now()), Math.min(retryAt - now + 50, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [retryAt]);

  const firstLoading = !data && !query.isError && (query.isLoading || query.isPending || query.isFetching);
  const hasIssue = Boolean(data?.message) || Boolean(query.isError);
  const showRetry = !firstLoading && (hasIssue || records.length === 0 || Boolean(data?.stale));
  const isRefreshing = Boolean(query.isFetching) && !firstLoading;
  const stateLabel = timelineData?.stateLabel || data?.stateLabel || "暂无物流状态";
  const isSigned = ["3", "301", "302", "303", "304", "signed", "delivered"].includes(timelineData?.state ?? data?.state ?? "") || /^(已签收|签收)$/.test(stateLabel);
  const updatedAt = timelineData?.updatedAt || data?.updatedAt;
  const isRetained = Boolean(records.length && (!data?.records?.length || data?.stale || query.isError));
  const displayedCompany = data?.trackingCompany || trackingCompany || "快递";
  const displayedTrackingNo = data?.trackingNo || trackingNo;
  const fallbackUrl = `https://www.kuaidi100.com/chaxun?${data?.carrierCode ? `com=${encodeURIComponent(data.carrierCode)}&` : ""}nu=${encodeURIComponent(displayedTrackingNo)}`;
  const subscriptionHint = data?.subscriptionStatus === "pending"
    ? "物流更新同步中，后续可再次打开查看。"
    : data?.subscriptionStatus === "active"
      ? "已开启物流更新同步。"
      : null;

  return (
    <section
      data-card-export-hide="true"
      aria-label="站内物流详情"
      aria-busy={Boolean(query.isFetching)}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-[4px] border border-gray-100 bg-[#FCFCFC] p-3 text-[11px] leading-4"
    >
      {firstLoading ? (
        <div role="status" className="flex min-h-[72px] items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#FF6900] motion-reduce:animate-none" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-gray-600">正在查询物流…</p>
            <p className="mt-1 break-words text-[10px] text-gray-400">通常在10秒内返回，请稍候。</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-start gap-1.5 font-semibold text-[#FF6900]">
              {isSigned ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-words">{stateLabel}</span>
            </span>
            {isRefreshing && (
              <span role="status" className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />更新中
              </span>
            )}
          </div>
          <p className="mt-1 break-words text-[10px] text-gray-400">物流更新时间：{formatTime(updatedAt)}</p>
          {isRetained && <p className="mt-1 text-[10px] text-gray-500">当前保留上次物流记录，最新信息以快递更新为准。</p>}

          {hasIssue && (
            <div role="status" className="mt-2 flex min-w-0 items-start gap-1.5 rounded-[3px] border border-orange-100 bg-orange-50 px-2 py-1.5 text-orange-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 break-words [overflow-wrap:anywhere]">
                {data?.message || "物流暂时查询失败，请稍后重试或联系商家。"}
              </p>
            </div>
          )}

          {records.length > 0 ? (
            <ol aria-label="物流时间线，最新记录在前" className="mt-3 min-w-0">
              {records.map((record, index) => (
                <li key={`${record.time}-${index}`} className="relative min-w-0 pb-3 pl-5 last:pb-0">
                  {index < records.length - 1 && <span className="absolute bottom-0 left-[4px] top-2 w-px bg-gray-200" aria-hidden="true" />}
                  <span className={`absolute left-0 top-1 h-[9px] w-[9px] rounded-full border-2 ${index === 0 ? "border-orange-100 bg-[#FF6900]" : "border-[#FCFCFC] bg-gray-300"}`} aria-hidden="true" />
                  <p className={`min-w-0 break-words [overflow-wrap:anywhere] ${index === 0 ? "font-medium text-[#FF6900]" : "text-gray-600"}`}>{record.context}</p>
                  {record.status && <p className={`mt-0.5 break-words text-[10px] ${index === 0 ? "text-orange-600" : "text-gray-500"}`}>{record.status}</p>}
                  <p className="mt-0.5 break-words text-[10px] text-gray-400">{formatTime(record.time)}</p>
                </li>
              ))}
            </ol>
          ) : !hasIssue ? (
            <p role="status" className="mt-3 break-words text-gray-500">暂未查到物流轨迹，快递揽收后将更新，请稍后查看。</p>
          ) : null}

          {isSigned && (
            <p className="mt-3 break-words border-t border-gray-100 pt-2 text-[10px] text-gray-500">
              快递显示已签收，仅为物流提示；实际收到商品后，请使用订单上的“确认收货”。
            </p>
          )}
          {subscriptionHint && <p className="mt-2 break-words text-[10px] text-gray-400">{subscriptionHint}</p>}

          {(showRetry || hasIssue) && (
            <div className="mt-3 border-t border-gray-100 pt-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                {showRetry && (
                  <button
                    type="button"
                    disabled={Boolean(query.isFetching) || retryBlocked}
                    aria-describedby={retryBlocked ? `logistics-retry-hint-${orderId}` : undefined}
                    onClick={() => {
                      // 再次校验实际时间，避免系统时钟变化或渲染延迟越过冷却限制。
                      if (query.isFetching || (Number.isFinite(retryAt) && Date.now() < retryAt)) return;
                      void query.refetch();
                    }}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-[#FF6900] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                  >
                    <RefreshCw className={`h-3 w-3 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                    {query.isFetching ? "查询中" : "重试"}
                  </button>
                )}
                {hasIssue && displayedTrackingNo && (
                  <a
                    href={fallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${displayedCompany}备用网页查询（将在新窗口打开）`}
                    className="inline-flex items-center gap-1 text-[10px] text-gray-400 underline underline-offset-2"
                  >
                    备用网页查询<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                )}
              </div>
              {retryBlocked && (
                <p id={`logistics-retry-hint-${orderId}`} className="mt-1.5 break-words text-[10px] text-gray-500">
                  为避免频繁查询，请在{formatTime(data?.canRetryAt)}后重试；到期不会自动查询。
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
