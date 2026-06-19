/**
 * 牙伴齿科商城 - H5 收银台
 * 路由：/yaban/shop/cashier?orderNo=xxx&amount=xxx&channel=wechat
 * 说明：
 *   - 多租户双支付框架（网页兼容版）：按当前环境自动适配微信/支付宝
 *     · 微信内置浏览器：仅展示微信支付
 *     · 支付宝客户端：仅展示支付宝
 *     · 普通浏览器：两者皆可（取决于商户启用情况）
 *   - sandbox 模拟模式：提供「模拟支付（测试）」按钮，调用 mockPaySuccess 跑通改单
 *   - live 模式：调用真实渠道（后端预留），本页只负责发起与跳转结果页
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

type Channel = "wechat" | "alipay";

// 环境探测：根据 UA 判断当前所处的支付环境
function detectEnv(): "wechat" | "alipay" | "browser" {
  if (typeof navigator === "undefined") return "browser";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("micromessenger")) return "wechat";
  if (ua.includes("alipayclient")) return "alipay";
  return "browser";
}

export default function YabanShopCashier() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/shop");
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const orderNo = params.get("orderNo") || "";
  const amount = Number(params.get("amount") || 0);
  const presetChannel = (params.get("channel") as Channel) || "wechat";

  const env = useMemo(() => detectEnv(), []);
  const [channel, setChannel] = useState<Channel>(presetChannel);
  const [paying, setPaying] = useState(false);

  // 查询当前订单可用的支付渠道与模式
  const methods = trpc.yabanPayment.getPayMethods.useQuery(
    { orderNo },
    { enabled: !!orderNo }
  );
  const createPayment = trpc.yabanPayment.createPayment.useMutation();
  const mockPaySuccess = trpc.yabanPayment.mockPaySuccess.useMutation();

  const mode = methods.data?.mode || "sandbox";

  // 环境过滤：微信内只留微信，支付宝内只留支付宝；普通浏览器看商户启用
  const canWechat =
    (env === "wechat" || env === "browser") && (methods.data?.wechat ?? true);
  const canAlipay =
    (env === "alipay" || env === "browser") && (methods.data?.alipay ?? true);

  // 根据环境纠正默认选中渠道
  useEffect(() => {
    if (env === "wechat") setChannel("wechat");
    else if (env === "alipay") setChannel("alipay");
  }, [env]);

  const handlePay = async () => {
    if (paying || !orderNo) return;
    setPaying(true);
    try {
      // live 模式：走真实渠道 HTTP 接口，后端返回可跳转的支付链接
      if (mode === "live") {
        const resp = await fetch("/api/yaban-pay/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderNo, channel }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "发起支付失败");
        if (data.alreadyPaid) {
          toast.success("该订单已支付");
          navigate(`/yaban/shop/pay-result?orderNo=${orderNo}&status=success`);
          return;
        }
        if (data.payUrl) {
          // 跳转微信/支付宝收银台；支付完成后回跳结果页轮询
          window.location.href = data.payUrl;
          return;
        }
        throw new Error("未获取到支付链接");
      }

      const res: any = await createPayment.mutateAsync({ orderNo, channel });
      if (res.alreadyPaid) {
        toast.success("该订单已支付");
        navigate(`/yaban/shop/pay-result?orderNo=${orderNo}&status=success`);
        return;
      }
      if (res.mode === "sandbox" && res.sandbox) {
        // 模拟模式：直接完成支付单，驱动订单状态，再进结果页
        await mockPaySuccess.mutateAsync({ paymentNo: res.paymentNo });
        navigate(
          `/yaban/shop/pay-result?orderNo=${orderNo}&paymentNo=${res.paymentNo}&status=success`
        );
        return;
      }
      // 不应走到这里（live 已改走下方 HTTP 分支）
      navigate(
        `/yaban/shop/pay-result?orderNo=${orderNo}&paymentNo=${res.paymentNo}`
      );
    } catch (e: any) {
      toast.error(e?.message || "发起支付失败，请重试");
    } finally {
      setPaying(false);
    }
  };

  if (!orderNo) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center">
        <p className="text-sm text-gray-400 mb-4">缺少订单信息</p>
        <button onClick={goBack} className="text-sm text-[#2196C8]">
          返回商城
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">

      {/* 顶部栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">收银台</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-3 pt-4 space-y-3 flex-1">
        {/* 金额区 */}
        <div className="bg-white rounded-xl px-4 py-6 text-center">
          <p className="text-xs text-gray-400 mb-1">订单号 {orderNo}</p>
          <p className="text-sm text-gray-500 mb-2">支付金额</p>
          <p className="text-[#FF5A5A] text-3xl font-bold">¥{amount}</p>
        </div>

        {/* 支付方式 */}
        <div className="bg-white rounded-xl px-3 py-1">
          <p className="text-sm text-gray-700 px-1 pt-3 pb-1">选择支付方式</p>

          {canWechat && (
            <ChannelOption
              label="微信支付"
              desc="使用微信完成支付"
              color="#1AAD19"
              active={channel === "wechat"}
              onClick={() => setChannel("wechat")}
            />
          )}
          {canWechat && canAlipay && <div className="h-px bg-gray-100 mx-1" />}
          {canAlipay && (
            <ChannelOption
              label="支付宝"
              desc="使用支付宝完成支付"
              color="#1677FF"
              active={channel === "alipay"}
              onClick={() => setChannel("alipay")}
            />
          )}

          {!canWechat && !canAlipay && (
            <p className="text-sm text-gray-400 px-1 py-6 text-center">
              当前医院尚未开通线上支付，请联系门店
            </p>
          )}
        </div>

        {/* 模式提示 */}
        {mode === "sandbox" && (
          <div className="bg-gradient-to-r from-[#E8F4FD] to-[#D6EEFB] rounded-xl px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1A6E96] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#1A6E96] leading-relaxed">
              当前为模拟支付模式（测试用），点击支付将直接完成订单，不会真实扣款。门店配置真实商户参数后自动切换为正式收款。
            </p>
          </div>
        )}
      </div>

      {/* 底部支付按钮 */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <button
            onClick={handlePay}
            disabled={paying || (!canWechat && !canAlipay)}
            className="w-full py-3 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {paying && <Loader2 className="w-4 h-4 animate-spin" />}
            {paying
              ? "支付中"
              : mode === "sandbox"
                ? `模拟支付 ¥${amount}`
                : `确认支付 ¥${amount}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelOption({
  label,
  desc,
  color,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-1 py-3">
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: color + "1A" }}
      >
        <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: color }} />
      </span>
      <div className="flex-1 text-left">
        <p className="text-sm text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-400">{desc}</p>
      </div>
      <span
        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
          active ? "bg-[#2196C8] border-[#2196C8]" : "border-gray-300"
        }`}
      >
        {active && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}
