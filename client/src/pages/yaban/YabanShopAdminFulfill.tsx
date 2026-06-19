/**
 * 牙办齿科商城 - 到店核销 + 退款审核（后台）
 * 路由：/yaban/shop/admin/fulfill
 * 风格：蓝白风，移动端优先，Tab 切换
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, QrCode, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";

type Tab = "verify" | "refund";

function fmtTime(val: any): string {
  if (!val) return "";
  return String(val).replace("T", " ").replace(/\.\d+Z?$/, "").slice(0, 16);
}

const REFUND_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: "待处理", color: "#D97706", bg: "#FEF3C7" },
  approved: { text: "已同意", color: "#2563EB", bg: "#DBEAFE" },
  rejected: { text: "已驳回", color: "#6B7280", bg: "#F3F4F6" },
  refunded: { text: "已退款", color: "#059669", bg: "#D1FAE5" },
};

export default function YabanShopAdminFulfill() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [tab, setTab] = useState<Tab>("verify");

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-6">
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban/shop/admin/orders")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">核销与售后</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <span className="w-6" />
        </div>
        <div className="max-w-lg mx-auto px-3 flex gap-2 pb-3">
          <button
            onClick={() => setTab("verify")}
            className={`flex-1 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-1 ${tab === "verify" ? "bg-white text-[#2196C8]" : "bg-white/20 text-white"}`}
          >
            <QrCode className="w-4 h-4" /> 到店核销
          </button>
          <button
            onClick={() => setTab("refund")}
            className={`flex-1 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-1 ${tab === "refund" ? "bg-white text-[#2196C8]" : "bg-white/20 text-white"}`}
          >
            <RotateCcw className="w-4 h-4" /> 退款审核
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3">
        {tab === "verify" ? <VerifyPanel /> : <RefundPanel />}
      </div>
    </div>
  );
}

function VerifyPanel() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string>("");
  const verify = trpc.yabanOrderFulfill.adminVerify.useMutation({
    onSuccess: (r) => { setResult(`核销成功：订单 ${r.orderNo}`); setCode(""); toast.success("核销成功"); },
    onError: (e) => { setResult(""); toast.error(e.message); },
  });
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5">
        <p className="text-sm text-gray-700 mb-3">输入客人出示的 8 位核销码</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="核销码"
          inputMode="numeric"
          className="w-full text-center text-2xl tracking-widest font-bold bg-[#F5F7FA] rounded-xl px-3 py-4 outline-none"
        />
        <button
          onClick={() => verify.mutate({ verifyCode: code })}
          disabled={verify.isPending || code.length < 4}
          className="mt-4 w-full py-3 rounded-full bg-[#7C3AED] text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          确认核销
        </button>
        {result && (
          <div className="mt-4 bg-[#D1FAE5] text-[#059669] rounded-xl p-3 text-sm text-center">{result}</div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">服务类订单付款后会生成核销码，客人到店出示即可核销完成。</p>
    </div>
  );
}

function RefundPanel() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"all" | "pending" | "refunded" | "rejected">("pending");
  const { data, isLoading } = trpc.yabanOrderFulfill.adminListRefunds.useQuery({ status });
  const list = (data?.list ?? []) as any[];
  const counts = data?.counts ?? {};

  const audit = trpc.yabanOrderFulfill.adminAuditRefund.useMutation({
    onSuccess: () => {
      toast.success("已处理");
      utils.yabanOrderFulfill.adminListRefunds.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const FILTERS: { k: typeof status; label: string }[] = [
    { k: "pending", label: "待处理" },
    { k: "refunded", label: "已退款" },
    { k: "rejected", label: "已驳回" },
    { k: "all", label: "全部" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setStatus(f.k)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${status === f.k ? "bg-[#2196C8] text-white" : "bg-white text-gray-500 border border-gray-100"}`}
          >
            {f.label}{typeof (counts as any)[f.k] === "number" && (counts as any)[f.k] > 0 ? `(${(counts as any)[f.k]})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">暂无退款申请</div>
      ) : (
        list.map((r) => {
          const sm = REFUND_STATUS[r.status] ?? REFUND_STATUS.pending;
          return (
            <div key={r.id} className="bg-white rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{r.refund_no}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ color: sm.color, backgroundColor: sm.bg }}>{sm.text}</span>
              </div>
              <div className="mt-2 text-[13px] text-gray-700 space-y-0.5">
                <p>订单：{r.order_no}</p>
                <p>客人：{r.user_name || `用户${r.user_id}`} {r.user_phone || ""}</p>
                <p>退款金额：<span className="text-[#E2452F] font-bold">¥{Number(r.amount).toFixed(2)}</span></p>
                <p className="text-gray-500">原因：{r.reason || "-"}</p>
                <p className="text-xs text-gray-400">{fmtTime(r.created_at)}</p>
                {r.admin_note && <p className="text-xs text-gray-400">处理备注：{r.admin_note}</p>}
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => audit.mutate({ refundNo: r.refund_no, approve: false, adminNote: "驳回" })}
                    disabled={audit.isPending}
                    className="flex-1 py-2 rounded-full border border-gray-300 text-gray-600 text-sm"
                  >驳回</button>
                  <button
                    onClick={() => { if (confirm(`确认退款 ¥${Number(r.amount).toFixed(2)} 给客人？`)) audit.mutate({ refundNo: r.refund_no, approve: true, adminNote: "同意退款" }); }}
                    disabled={audit.isPending}
                    className="flex-1 py-2 rounded-full bg-[#059669] text-white text-sm"
                  >同意退款</button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
