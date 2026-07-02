/**
 * 牙伴齿科商城 - 优惠券管理（后台）
 * 路由：/yaban/shop/admin/coupons
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";

type CouponType = "full_reduce" | "discount";

interface FormState {
  id?: number;
  name: string;
  type: CouponType;
  threshold: string;
  amount: string;
  discount: string;
  totalQty: string;
  perUserLimit: string;
  validDays: string;
}

const emptyForm: FormState = {
  name: "", type: "full_reduce", threshold: "0", amount: "",
  discount: "0.9", totalQty: "0", perUserLimit: "1", validDays: "30",
};

export default function YabanShopAdminCoupons() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/shop/admin/orders");
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanCoupon.adminListCoupons.useQuery();
  const list = (data ?? []) as any[];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const save = trpc.yabanCoupon.adminSaveCoupon.useMutation({
    onSuccess: () => { toast.success("已保存"); setShowForm(false); utils.yabanCoupon.adminListCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = trpc.yabanCoupon.adminToggleCoupon.useMutation({
    onSuccess: () => utils.yabanCoupon.adminListCoupons.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.name.trim()) return toast.error("请填写券名称");
    save.mutate({
      id: form.id,
      name: form.name.trim(),
      type: form.type,
      threshold: Number(form.threshold) || 0,
      amount: form.type === "full_reduce" ? Number(form.amount) || 0 : 0,
      discount: form.type === "discount" ? Number(form.discount) : undefined,
      totalQty: Number(form.totalQty) || 0,
      perUserLimit: Number(form.perUserLimit) || 1,
      validDays: Number(form.validDays) || 30,
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-6">
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight">优惠券管理</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={() => { setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-1 text-xs bg-white/20 px-2.5 py-1 rounded-md">
            <Plus className="w-3.5 h-3.5" /> 新建
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无优惠券，点击右上角新建</div>
        ) : (
          list.map((c) => (
            <div key={c.id} className="bg-white rounded-md p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{c.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-md ${c.status ? "bg-[#D1FAE5] text-[#059669]" : "bg-gray-100 text-gray-400"}`}>
                  {c.status ? "已上架" : "已下架"}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-gray-500 space-y-0.5">
                <p>{c.type === "discount" ? `${(Number(c.discount) * 10).toFixed(1)}折` : `满${Number(c.threshold)}减${Number(c.amount)}`} · 有效期{c.valid_days}天</p>
                <p>已领 {c.claimed_qty}/{Number(c.total_qty) === 0 ? "不限量" : c.total_qty} · 每人限领{c.per_user_limit}张</p>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setForm({
                    id: c.id, name: c.name, type: c.type, threshold: String(c.threshold),
                    amount: String(c.amount), discount: String(c.discount ?? "0.9"),
                    totalQty: String(c.total_qty), perUserLimit: String(c.per_user_limit), validDays: String(c.valid_days),
                  }); setShowForm(true); }}
                  className="flex-1 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs"
                >编辑</button>
                <button
                  onClick={() => toggle.mutate({ id: c.id, status: c.status ? 0 : 1 })}
                  className="flex-1 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs"
                >{c.status ? "下架" : "上架"}</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setShowForm(false)}>
          <div className="mt-auto bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">{form.id ? "编辑优惠券" : "新建优惠券"}</span>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
              <Field label="券名称">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如 新客立减 / 满200减30" className="inp" />
              </Field>
              <Field label="券类型">
                <div className="flex gap-2">
                  <button onClick={() => setForm({ ...form, type: "full_reduce" })}
                    className={`flex-1 py-2 rounded text-sm ${form.type === "full_reduce" ? "bg-[#2196C8] text-white" : "bg-[#F5F7FA] text-gray-600"}`}>满减券</button>
                  <button onClick={() => setForm({ ...form, type: "discount" })}
                    className={`flex-1 py-2 rounded text-sm ${form.type === "discount" ? "bg-[#2196C8] text-white" : "bg-[#F5F7FA] text-gray-600"}`}>折扣券</button>
                </div>
              </Field>
              <Field label="使用门槛（满多少元可用，0为无门槛）">
                <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                  inputMode="decimal" placeholder="0" className="inp" />
              </Field>
              {form.type === "full_reduce" ? (
                <Field label="减免金额（元）">
                  <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    inputMode="decimal" placeholder="如 30" className="inp" />
                </Field>
              ) : (
                <Field label="折扣率（如 0.9 表示 9 折，范围 0.1-0.99）">
                  <input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })}
                    inputMode="decimal" placeholder="0.9" className="inp" />
                </Field>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Field label="发放总量(0不限)">
                  <input value={form.totalQty} onChange={(e) => setForm({ ...form, totalQty: e.target.value })} inputMode="numeric" className="inp" />
                </Field>
                <Field label="每人限领">
                  <input value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} inputMode="numeric" className="inp" />
                </Field>
                <Field label="有效天数">
                  <input value={form.validDays} onChange={(e) => setForm({ ...form, validDays: e.target.value })} inputMode="numeric" className="inp" />
                </Field>
              </div>
              <button onClick={submit} disabled={save.isPending}
                className="w-full py-3 rounded-md bg-[#2196C8] text-white font-semibold disabled:opacity-60">
                {save.isPending ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.inp{width:100%;background:#F5F7FA;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}
