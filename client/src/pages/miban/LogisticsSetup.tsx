import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { mtrpc } from "./mibanTrpc";
import {
  Truck,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Send,
  Search,
  Clock,
} from "lucide-react";
import { Link } from "wouter";
import type {
  AdminLogisticsFeedback,
  AdminLogisticsHealth,
  LogisticsDetails,
  LogisticsFeedbackCategory,
} from "@shared/miban-logistics";

const operationLabels: Record<AdminLogisticsFeedback["operation"], string> = {
  query: "查询",
  subscription: "订阅提交",
  callback: "已验签回调",
};
const categoryLabels: Record<LogisticsFeedbackCategory, string> = {
  success: "成功",
  quota: "额度不足",
  authorization: "授权异常",
  phone: "电话校验未通过",
  rate_limit: "请求受限",
  no_data: "暂无轨迹",
  duplicate: "外方已有订阅",
  invalid_request: "请求参数异常",
  provider: "服务方异常",
  aborted: "已中止",
};
const successLabels: Record<AdminLogisticsFeedback["operation"], string> = {
  query: "最近查询成功",
  subscription: "订阅已提交",
  callback: "已接收推送",
};

function formatTime(value: string | null | undefined) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}

function FeedbackRecord({ feedback }: { feedback: AdminLogisticsFeedback }) {
  const success = feedback.category === "success";
  const quota = feedback.category === "quota";
  const duplicate = feedback.category === "duplicate" ||
    (feedback.operation === "subscription" && feedback.code === "501");
  const label = duplicate ? "外方已有订阅" : success
    ? successLabels[feedback.operation]
    : categoryLabels[feedback.category];
  return (
    <div className="min-w-0 space-y-1.5 break-words text-xs leading-5 [overflow-wrap:anywhere]">
      <p className={`flex items-start gap-1.5 font-semibold ${quota ? "text-red-600" : success && !duplicate ? "text-green-700" : "text-amber-700"}`}>
        {success && !duplicate ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0">{label}</span>
      </p>
      <p className="text-gray-600">{duplicate
        ? "外方表示该运单已订阅；仅代表外方已有订阅，不表示本站推送已正常工作。"
        : feedback.message}</p>
      <p className="text-[11px] text-gray-500">{quota ? "官方 code" : "反馈 code"}：<span className="font-mono">{feedback.code || "未提供"}</span></p>
      <p className="text-[11px] text-gray-500">记录时间（北京时间）：{formatTime(feedback.at)}</p>
      {(feedback.carrierCode || feedback.trackingNoMasked) && <p className="text-[11px] text-gray-400">承运商：{feedback.carrierCode || "未提供"} · 脱敏单号：{feedback.trackingNoMasked || "未提供"}</p>}
    </div>
  );
}

function LatestFeedback({ title, feedback }: { title: string; feedback: AdminLogisticsFeedback | null }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      {feedback ? <FeedbackRecord feedback={feedback} /> : <p className="text-xs leading-5 text-gray-500">暂无已保存的请求记录，当前结果未知。</p>}
    </section>
  );
}

function ConfigurationRow({ label, configured, enabledLabel = "已配置", disabledLabel = "未配置" }: {
  label: string;
  configured: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
}) {
  return <div className="flex min-w-0 items-start justify-between gap-3 text-xs leading-5">
    <span className="min-w-0 break-words">{label}</span>
    <span className={`shrink-0 ${configured ? "text-orange-600" : "text-gray-500"}`}>{configured ? enabledLabel : disabledLabel}</span>
  </div>;
}

function AdminLogisticsStatus() {
  // This endpoint reads local telemetry only; it never queries the provider.
  const health = mtrpc.order.logisticsHealth.useQuery(undefined, {
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const query = mtrpc.order.logisticsTest.useMutation({
    onSuccess: () => { void health.refetch(); },
    onError: () => { void health.refetch(); },
  });
  const [trackingCompany, setCompany] = useState("中通快递");
  const [trackingNo, setTrackingNo] = useState("");
  const [phone, setPhone] = useState("");
  // Do not present stale cached health as normal when the latest read failed.
  const status = health.error ? undefined : health.data as AdminLogisticsHealth | undefined;
  const details = query.data as LogisticsDetails | undefined;
  const quotaFeedback = status ? [
    status.lastQuery, status.lastSubscription, status.lastCallback, ...status.recent,
  ].filter((feedback): feedback is AdminLogisticsFeedback => feedback?.category === "quota")
    .sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;

  return <main className="mx-auto w-full min-w-0 max-w-[480px] space-y-4 bg-[#F8F6F3] p-4 pb-8 text-gray-700 [overflow-wrap:anywhere]">
    <Link href="/p/proj_hzxm2t/admin" className="inline-flex items-center gap-1 text-xs text-gray-500"><ArrowLeft className="h-3 w-3 shrink-0" />返回管理中心</Link>
    <header>
      <h1 className="flex items-center gap-2 text-lg font-bold"><Truck className="h-5 w-5 shrink-0 text-orange-500" />物流服务状态</h1>
      <p className="mt-1 text-xs leading-5 text-gray-500">仅系统管理员可见。查看配置和最近请求记录，不以配置状态判断接口可用性或账户欠费。</p>
    </header>
    <section className="min-w-0 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-800">
      <p className="font-semibold">继续沿用 Excel 发货流程</p>
      <p className="mt-1">发货信息保存与物流 API 请求是两件事。Excel 发货已保存成功时，接口查询或订阅失败不代表发货保存失败；无需因为物流接口反馈重新导入或重复发货。</p>
    </section>
    <section className="min-w-0 space-y-2 rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">状态记录</h2>
        <button type="button" onClick={() => { void health.refetch(); }} disabled={health.isFetching} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-medium text-orange-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${health.isFetching ? "animate-spin" : ""}`} />{health.isFetching ? "读取中…" : "刷新状态"}
        </button>
      </div>
      <p className="text-[11px] leading-5 text-gray-500">刷新只读取本站保存的记录，不发送物流查询，不产生服务方调用费用。不自动轮询。</p>
      {status && <p className="text-[11px] leading-5 text-gray-400">本次读取时间（北京时间）：{formatTime(status.checkedAt)}</p>}
      {health.error ? <div role="alert" className="space-y-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">
        <p className="font-semibold">状态未知：读取失败</p>
        <p>无法确认当前配置、额度反馈和请求记录，不应视为正常或未配置。</p>
        <button type="button" onClick={() => { void health.refetch(); }} disabled={health.isFetching} className="min-h-9 rounded-lg border border-red-200 px-3 py-1.5 font-medium disabled:opacity-50">重新读取状态</button>
      </div> : !status ? <p role="status" className="flex items-center gap-2 text-xs leading-5 text-gray-500">{health.isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{health.isFetching ? "正在读取状态，配置与最近结果暂未知…" : "状态未知，尚未读取到记录，请刷新重试。"}</p> : null}
    </section>
    {status && <>
      {status.storageWarning && <div role="alert" className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><p className="font-semibold">记录存储提醒</p><p className="mt-1 break-words">{status.storageWarning}</p><p className="mt-1">最近记录可能不完整，不能仅凭没有错误记录判断接口正常。</p></div>}
      <section className="min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 shrink-0 text-orange-500" />接入配置（不等于真实调用结果）</h2>
        <ConfigurationRow label="查询授权配置" configured={status.queryConfigured} />
        <ConfigurationRow label="自动订阅开关" configured={status.subscriptionEnabled} enabledLabel="已启用" disabledLabel="未启用" />
        <ConfigurationRow label="推送回调配置" configured={status.callbackConfigured} />
        <p className="border-t border-gray-100 pt-2 text-[11px] leading-5 text-gray-500">配置齐备不代表已调用成功。订阅已提交不代表本站已收到推送；请分别查看下方查询、订阅提交和已验签回调记录。</p>
      </section>
      <section className={`min-w-0 space-y-2 rounded-xl border p-4 ${quotaFeedback ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"}`}>
        <h2 className="text-sm font-semibold">账户余额与额度</h2>
        <p className="text-xs leading-5 text-gray-600">余额 / 剩余单量：未知</p>
        <p className="text-xs leading-5 text-gray-500">接口未提供余额或剩余单量；发生无可用单量等错误会在这里显示。充值与准确余额仍到百递云账户。</p>
        {quotaFeedback && <div role="alert" className="space-y-2 border-t border-red-200 pt-3">
          <p className="flex items-start gap-1.5 text-sm font-semibold leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />最近请求记录含额度不足反馈</p>
          <p className="text-[11px] leading-5 text-red-600">来源：{operationLabels[quotaFeedback.operation]}。这是该次请求结果，不是实时余额；请到百递云账户核对欠费、套餐与剩余单量。</p>
          <FeedbackRecord feedback={quotaFeedback} />
        </div>}
      </section>
      <section className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold">最近真实结果</h2>
        <p className="text-[11px] leading-5 text-gray-500">展示已保存的最近请求记录。限频或缓存返回不代表新调用，也不会更新为一次新的接口成功。</p>
        <LatestFeedback title="最近查询" feedback={status.lastQuery} />
        <LatestFeedback title="最近订阅提交" feedback={status.lastSubscription} />
        <LatestFeedback title="最近已验签回调" feedback={status.lastCallback} />
        <p className="text-[11px] leading-5 text-gray-500">501（重复订阅）仅表示外方已订阅，不承诺本站推送已工作；以已验签回调记录确认本站是否接收过推送。</p>
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 shrink-0 text-orange-500" />最近请求记录（最多 30 条）</h2>
        {status.recent.length ? <ol className="space-y-3">{status.recent.slice(0, 30).map((feedback, index) => <li key={`${feedback.operation}-${feedback.at}-${index}`} className="min-w-0 border-t border-gray-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">{feedback.operation === "subscription" ? <Send className="h-3 w-3 shrink-0" /> : feedback.operation === "callback" ? <ShieldCheck className="h-3 w-3 shrink-0" /> : <Search className="h-3 w-3 shrink-0" />}{operationLabels[feedback.operation]}</p>
          <FeedbackRecord feedback={feedback} />
        </li>)}</ol> : <p className="text-xs leading-5 text-gray-500">暂无已保存的最近请求记录；这不代表接口可用，也不代表账户没有欠费。</p>}
      </section>
    </>}
    <form className="min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white p-4" onSubmit={event => {
      event.preventDefault();
      if (query.isPending) return;
      query.mutate({ trackingCompany: trackingCompany.trim(), trackingNo: trackingNo.trim(), phone: phone.trim() || undefined });
    }}>
      <h2 className="text-sm font-semibold">试查一个真实包裹</h2>
      <p className="text-xs leading-5 text-gray-500">只有提交此表单才尝试调用查询接口，可能消耗服务方单量。不创建订单，不订阅包裹，不修改发货或钱包。</p>
      <label className="block text-xs leading-5">快递公司<input value={trackingCompany} onChange={event => setCompany(event.target.value)} required maxLength={32} className="mt-1 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" /></label>
      <label className="block text-xs leading-5">快递单号<input value={trackingNo} onChange={event => setTrackingNo(event.target.value)} required minLength={6} maxLength={32} autoComplete="off" className="mt-1 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" /></label>
      <label className="block text-xs leading-5">收件或寄件电话<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={30} autoComplete="off" aria-describedby="logistics-phone-help" className="mt-1 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" /></label>
      <p id="logistics-phone-help" className="text-[11px] leading-5 text-gray-500">中通、顺丰文档要求提供正确收件或寄件电话；其他快递可按需填写。试查电话需手动输入，不自动猜测。客户查看订单物流使用订单收件电话，无需填写本页表单。</p>
      <p className="text-[11px] leading-5 text-gray-500">同一运单至少间隔 30 分钟，限频内使用缓存。重复点击不是一次新查询，请以最近请求记录及其时间为准。</p>
      <button disabled={query.isPending} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#FF6900] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{query.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{query.isPending ? "正在获取物流…" : "开始试查"}</button>
      {query.error && <p role="alert" className="text-xs leading-5 text-red-600">试查失败或查询暂不可用，请查看上方最近请求记录；若状态记录也读取失败，请重新读取状态后再判断原因。</p>}
    </form>
    {details && <section aria-live="polite" className="min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white p-4">
      <h2 className="flex items-start gap-2 text-sm font-semibold"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span className="min-w-0">试查返回的物流记录 · {details.stateLabel}</span></h2>
      <p className="text-[11px] leading-5 text-gray-500">返回可能来自缓存，不是新的接口请求结果；服务方反馈以上方最近请求记录为准。</p>
      {details.message && <p className="break-words text-xs leading-5 text-amber-700">{details.message}</p>}
      {details.canRetryAt && <p className="text-[11px] leading-5 text-gray-500">下次可请求更新（北京时间）：{formatTime(details.canRetryAt)}</p>}
      {details.updatedAt && <p className="text-[11px] leading-5 text-gray-500">物流记录获取时间（北京时间）：{formatTime(details.updatedAt)}{details.stale ? "（已保存记录）" : ""}</p>}
      <ol className="min-w-0 space-y-3 border-l border-orange-200 pl-4">{details.records.map((record, index) => <li key={`${record.time}-${index}`} className={`min-w-0 ${index === 0 ? "text-orange-700" : "text-gray-500"}`}><p className="text-[11px] leading-5">{record.time}</p><p className="mt-1 break-words text-xs leading-5">{record.context}</p></li>)}</ol>
      {!details.records.length && <p className="text-xs leading-5 text-gray-500">此次尚未获取到物流轨迹，不代表包裹没有发货。</p>}
    </section>}
  </main>;
}

export default function LogisticsSetup() {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <div role="status" className="p-8 text-center text-sm text-gray-500">正在确认账户…</div>;
  if (error) return <div role="alert" className="mx-auto max-w-[480px] space-y-3 p-6 text-center text-sm text-gray-500"><p>账户权限读取失败，暂不能查看物流服务状态。</p><button type="button" onClick={() => { void refresh(); }} className="min-h-10 rounded-lg border border-orange-200 px-4 py-2 text-orange-600">重新确认权限</button></div>;
  if (user?.role !== "super_admin") return <div className="mx-auto max-w-[480px] space-y-3 p-8 text-center text-sm text-gray-500"><p>仅系统管理员可查看物流服务状态。</p><Link href="/p/proj_hzxm2t/" className="inline-flex min-h-9 items-center text-orange-600">返回米伴首页</Link></div>;
  // Mount administrator requests only after useAuth confirms the real role.
  return <AdminLogisticsStatus key={user.id} />;
}
