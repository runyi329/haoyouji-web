/**
 * 牙伴齿科商城 - 支付结果页
 * 路由：/yaban/shop/pay-result?orderNo=xxx&paymentNo=xxx&status=success
 * 说明：
 *   - 有 paymentNo 时轮询 getPaymentStatus（live 模式真实回调需要时间）
 *   - sandbox 模拟支付完成后会直接带 status=success 进来
 *   - 成功：对勾 + 查看订单 / 返回商城
 *   - 失败/取消：提示 + 重新支付 / 返回商城
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

export default function YabanShopPayResult() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const orderNo = params.get("orderNo") || "";
  const paymentNo = params.get("paymentNo") || "";
  const presetStatus = params.get("status") || "";

  // 是否需要轮询（有支付单号且未预先标记成功）
  const needPoll = !!paymentNo && presetStatus !== "success";
  const [pollCount, setPollCount] = useState(0);

  const statusQuery = trpc.yabanPayment.getPaymentStatus.useQuery(
    { paymentNo },
    {
      enabled: needPoll,
      refetchInterval: needPoll && pollCount < 20 ? 2000 : false,
    }
  );

  useEffect(() => {
    if (!needPoll) return;
    const t = setInterval(() => setPollCount((c) => c + 1), 2000);
    return () => clearInterval(t);
  }, [needPoll]);

  // 计算最终状态：success / failed / pending
  const finalStatus: "success" | "failed" | "pending" = (() => {
    if (presetStatus === "success") return "success";
    if (presetStatus === "failed" || presetStatus === "cancel") return "failed";
    const s = statusQuery.data?.status;
    if (s === "success") return "success";
    if (s === "failed" || s === "closed") return "failed";
    // 轮询超时仍 pending 视为待确认
    if (pollCount >= 20) return "failed";
    return "pending";
  })();

  const amount = statusQuery.data?.amount;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <PageTag code="P307" />

      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center">
          <span className="text-base font-bold mx-auto">支付结果</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-12">
        {finalStatus === "pending" && (
          <>
            <Loader2 className="w-14 h-14 text-[#2196C8] mb-4 animate-spin" />
            <p className="text-lg font-bold text-gray-800 mb-2">支付确认中</p>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-8">
              正在确认支付结果，请稍候…如已完成支付可稍后在「我的订单」查看。
            </p>
          </>
        )}

        {finalStatus === "success" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-[#2196C8] mb-4" />
            <p className="text-lg font-bold text-gray-800 mb-2">支付成功</p>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-1">
              {amount ? `已支付 ¥${amount}` : "订单已完成支付"}
            </p>
            <p className="text-xs text-gray-400 text-center leading-relaxed mb-8">
              订单号 {orderNo}，门店会尽快为您安排后续服务。
            </p>
            <div className="w-full max-w-xs space-y-2">
              <button
                onClick={() => navigate("/yaban/shop/my-orders")}
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium"
              >
                查看订单
              </button>
              <button
                onClick={() => navigate("/yaban/shop")}
                className="w-full py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm"
              >
                继续逛商城
              </button>
            </div>
          </>
        )}

        {finalStatus === "failed" && (
          <>
            <XCircle className="w-16 h-16 text-[#FF5A5A] mb-4" />
            <p className="text-lg font-bold text-gray-800 mb-2">支付未完成</p>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-8">
              未检测到支付成功，您可以重新支付或稍后在「我的订单」中继续。
            </p>
            <div className="w-full max-w-xs space-y-2">
              <button
                onClick={() =>
                  navigate(`/yaban/shop/cashier?orderNo=${orderNo}&amount=${amount || ""}`)
                }
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium"
              >
                重新支付
              </button>
              <button
                onClick={() => navigate("/yaban/shop/my-orders")}
                className="w-full py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm"
              >
                查看订单
              </button>
              <button
                onClick={() => navigate("/yaban/shop")}
                className="w-full py-2.5 text-gray-400 text-sm"
              >
                返回商城
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
