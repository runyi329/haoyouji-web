/**
 * 牙伴齿科商城 - 确认订单页（含微信/支付宝支付方式占位）
 * 路由：/yaban/shop/checkout
 * 说明：支付暂未对接真实渠道，点击提交后走模拟下单成功
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Check, CheckCircle2, Loader2 } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getProductById } from "./shopData";
import { useCart } from "./useCart";

type PayMethod = "wechat" | "alipay";

export default function YabanShopCheckout() {
  const [, navigate] = useLocation();
  const { items, clear } = useCart();
  const [pay, setPay] = useState<PayMethod>("wechat");
  const [remark, setRemark] = useState("");
  const [done, setDone] = useState(false);
  const createOrder = trpc.yabanShop.createOrder.useMutation();

  const rows = useMemo(
    () =>
      items
        .map((it) => ({ item: it, product: getProductById(it.id) }))
        .filter((r) => r.product),
    [items]
  );

  const total = rows.reduce((s, r) => s + r.product!.price * r.item.qty, 0);
  const hasService = rows.some((r) => r.product!.kind === "service");

  const handleSubmit = async () => {
    if (createOrder.isPending) return;
    // 支付仍为占位，但订单真实落库
    const payload = rows.map(({ item, product }) => ({
      code: product!.id,
      name: product!.name,
      image: product!.image || undefined,
      kind: product!.kind,
      price: product!.price,
      qty: item.qty,
    }));
    try {
      await createOrder.mutateAsync({
        items: payload,
        payMethod: pay,
        remark: remark.trim() || undefined,
      });
      clear();
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message || "下单失败，请重试");
    }
  };

  // 下单成功页
  if (done) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
        <PageTag code="P305" />
        <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
          <div className="max-w-lg mx-auto px-3 py-3 flex items-center">
            <span className="text-base font-bold mx-auto">下单成功</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-16">
          <CheckCircle2 className="w-16 h-16 text-[#2196C8] mb-4" />
          <p className="text-lg font-bold text-gray-800 mb-2">提交成功</p>
          <p className="text-sm text-gray-500 text-center leading-relaxed mb-8">
            {hasService
              ? "您的诊疗预约已提交，门店会尽快与您联系确认到院时间。"
              : "您的订单已提交，我们会尽快为您安排发货。"}
          </p>
          <div className="w-full max-w-xs space-y-2">
            <button
              onClick={() => navigate("/yaban/shop")}
              className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium"
            >
              继续逛商城
            </button>
            <button
              onClick={() => navigate("/yaban")}
              className="w-full py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm"
            >
              返回工作台
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 空购物车保护
  if (rows.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center">
        <PageTag code="P305" />
        <p className="text-sm text-gray-400 mb-4">没有可结算的商品</p>
        <button onClick={() => navigate("/yaban/shop")} className="text-sm text-[#2196C8]">
          返回商城
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-24">
      <PageTag code="P305" />

      {/* 顶部返回栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban/shop/cart")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">确认订单</span>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3 space-y-2">
        {/* 商品清单 */}
        <div className="bg-white rounded-xl p-3 space-y-3">
          {rows.map(({ item, product }) => (
            <div key={item.id} className="flex gap-3">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] shrink-0 overflow-hidden flex items-center justify-center">
                {product!.image ? (
                  <img src={product!.image} alt={product!.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#9DCCE6] text-[10px]">配图</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800 line-clamp-1">{product!.name}</p>
                <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{product!.subtitle}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[#FF5A5A] text-sm font-bold">¥{product!.price}</span>
                  <span className="text-xs text-gray-400">x{item.qty}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 诊疗项目提示 */}
        {hasService && (
          <div className="bg-gradient-to-r from-[#E8F4FD] to-[#D6EEFB] rounded-xl px-3 py-2.5">
            <p className="text-[12px] text-[#1A6E96] leading-relaxed">
              订单含诊疗项目，线上支付为预约定金或诊疗预约，余款及方案以到院面诊为准。
            </p>
          </div>
        )}

        {/* 备注 */}
        <div className="bg-white rounded-xl px-3 py-3">
          <p className="text-sm text-gray-700 mb-2">订单备注</p>
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="选填，如到院时间、联系方式等"
            className="w-full bg-[#F5F7FA] rounded-lg px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
        </div>

        {/* 支付方式（占位） */}
        <div className="bg-white rounded-xl px-3 py-1">
          <p className="text-sm text-gray-700 px-1 pt-2 pb-1">支付方式</p>
          <PayOption
            label="微信支付"
            desc="暂未对接，提交后为占位流程"
            color="#1AAD19"
            active={pay === "wechat"}
            onClick={() => setPay("wechat")}
          />
          <div className="h-px bg-gray-100 mx-1" />
          <PayOption
            label="支付宝"
            desc="暂未对接，提交后为占位流程"
            color="#1677FF"
            active={pay === "alipay"}
            onClick={() => setPay("alipay")}
          />
        </div>
      </div>

      {/* 底部提交栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            实付 <span className="text-[#FF5A5A] text-lg font-bold">¥{total}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={createOrder.isPending}
            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
          >
            {createOrder.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {createOrder.isPending ? "提交中" : "提交订单"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayOption({
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
        {active && <Check className="w-3.5 h-3.5 text-white" />}
      </span>
    </button>
  );
}
