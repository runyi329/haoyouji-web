import { useState, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { PageTag } from "@/components/PageTag";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  X,
  Trash2,
  Wallet,
  CircleDollarSign,
  AlertTriangle,
  Receipt,
  Loader2,
  Ban,
  CheckCircle2,
  Search,
  Users,
  Award,
} from "lucide-react";
import ToothPicker from "./ToothPicker";
import ChargeProductPicker, { type ChargeProductPick } from "./ChargeProductPicker";

// 支付方式选项
const PAY_METHODS = ["现金", "微信", "支付宝", "银行卡", "预付款", "医保", "其他"];

// 收费单状态显示
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  paid: { label: "已收清", cls: "bg-green-50 text-green-600" },
  partial: { label: "部分收款", cls: "bg-orange-50 text-orange-600" },
  unpaid: { label: "未收款", cls: "bg-red-50 text-red-500" },
  void: { label: "已作废", cls: "bg-gray-100 text-gray-400" },
};

// 收费单列表项类型（与后端 listCharges 对应）
interface ChargeRow {
  id: number;
  chargeNo: string;
  chargeType: string;
  summary: string | null;
  totalAmount: number;
  discountAmount: number;
  receivable: number;
  paid: number;
  owed: number;
  changeAmount: number;
  status: string;
  doctor: string | null;
  cashierName: string | null;
  dept: string | null;
  remark: string | null;
  visitAt: string | null;
  createdAt: string | null;
}

// 快速收费的项目行（前端编辑态）
interface ItemDraft {
  name: string;
  tooth: string;
  unitPrice: string; // 用字符串便于输入
  quantity: string;
  discount: string; // 折扣，100=不打折
}

// 组合支付的一行
interface PayDraft {
  method: string;
  amount: string;
}

// 业绩分配的一行（前端编辑态）
interface PerfDraft {
  staffId: number | null;
  staffName: string;
  roleKey: string;
  shareType: "amount" | "percent";
  shareValue: string;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// 计算单个项目小计
function calcSubtotal(it: ItemDraft): number {
  const price = parseFloat(it.unitPrice) || 0;
  const qty = parseFloat(it.quantity) || 0;
  const disc = it.discount === "" ? 100 : Math.min(100, Math.max(0, parseFloat(it.discount) || 0));
  return Math.round(price * qty * (disc / 100) * 100) / 100;
}

export default function YabanPatientCharge() {
  const [, navigate] = useLocation();
  const { current, currentTenantId } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [, params] = useRoute("/yaban/patient/:id/charge");
  const customerId = params?.id ? Number(params.id) : 0;

  const { user } = useAuth();
  const { data: membership } = trpc.yabanRole.myMembership.useQuery({ tenantId: currentTenantId ?? undefined });
  const perms: string[] = membership?.permissions || [];
  const isSuper = user?.role === "super_admin" || !!membership?.isFounder;
  // 开单/补收/作废需 finance 权限
  const canCharge = isSuper || perms.includes("finance");

  const utils = trpc.useUtils();
  const statsQuery = trpc.yabanCustomer.chargeStats.useQuery(
    { customerId },
    { enabled: customerId > 0, refetchOnWindowFocus: false }
  );
  const listQuery = trpc.yabanCustomer.listCharges.useQuery(
    { customerId },
    { enabled: customerId > 0, refetchOnWindowFocus: false }
  );
  const charges: ChargeRow[] = (listQuery.data?.list as ChargeRow[]) || [];

  const createMutation = trpc.yabanCustomer.createCharge.useMutation();
  const settleMutation = trpc.yabanCustomer.settleCharge.useMutation();
  const voidMutation = trpc.yabanCustomer.voidCharge.useMutation();

  // ============ 快速收费弹层状态 ============
  const [showCreate, setShowCreate] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>([
    { name: "", tooth: "", unitPrice: "", quantity: "1", discount: "100" },
  ]);
  const [orderDiscount, setOrderDiscount] = useState(""); // 整单立减金额
  const [payments, setPayments] = useState<PayDraft[]>([{ method: "现金", amount: "" }]);
  const [doctor, setDoctor] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 业绩分配草稿
  const [perfs, setPerfs] = useState<PerfDraft[]>([]);
  // 选择器开关：项目库（记录目标行）/ 牙位（记录目标行）
  const [prodPickerIdx, setProdPickerIdx] = useState<number | null>(null);
  const [toothPickerIdx, setToothPickerIdx] = useState<number | null>(null);

  // 诊所员工列表（业绩分配选人）
  const membersQuery = trpc.yabanCustomer.listClinicMembers.useQuery(undefined, {
    enabled: showCreate,
    refetchOnWindowFocus: false,
  });
  const members = (membersQuery.data as { userId: number; name: string; roleKey: string; roleName: string }[]) || [];

  // 实时金额计算
  const calc = useMemo(() => {
    const total = items.reduce((s, it) => s + calcSubtotal(it), 0);
    const discAmt = parseFloat(orderDiscount) || 0;
    const receivable = Math.max(0, Math.round((total - discAmt) * 100) / 100);
    const paid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const owed = Math.max(0, Math.round((receivable - paid) * 100) / 100);
    const change = Math.max(0, Math.round((paid - receivable) * 100) / 100);
    return {
      total: Math.round(total * 100) / 100,
      receivable,
      paid: Math.round(paid * 100) / 100,
      owed,
      change,
    };
  }, [items, orderDiscount, payments]);

  const resetCreate = useCallback(() => {
    setItems([{ name: "", tooth: "", unitPrice: "", quantity: "1", discount: "100" }]);
    setOrderDiscount("");
    setPayments([{ method: "现金", amount: "" }]);
    setDoctor("");
    setRemark("");
    setPerfs([]);
  }, []);

  const handleSubmit = useCallback(async () => {
    // 校验项目
    const validItems = items
      .filter((it) => it.name.trim() && (parseFloat(it.unitPrice) || 0) >= 0)
      .map((it) => ({
        name: it.name.trim(),
        tooth: it.tooth.trim() || undefined,
        unitPrice: parseFloat(it.unitPrice) || 0,
        quantity: parseFloat(it.quantity) || 1,
        discount: it.discount === "" ? 100 : Math.min(100, Math.max(0, parseFloat(it.discount) || 0)),
      }));
    if (validItems.length === 0) {
      toast.error("请至少填写一个收费项目（名称+金额）");
      return;
    }
    const validPays = payments
      .filter((p) => (parseFloat(p.amount) || 0) > 0)
      .map((p) => ({ method: p.method, amount: parseFloat(p.amount) || 0 }));
    const validPerfs = perfs
      .filter((p) => p.staffName.trim())
      .map((p) => ({
        staffId: p.staffId ?? undefined,
        staffName: p.staffName.trim(),
        roleKey: p.roleKey || undefined,
        shareType: p.shareType,
        shareValue: parseFloat(p.shareValue) || 0,
      }));
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        customerId,
        chargeType: "quick",
        items: validItems,
        discountAmount: parseFloat(orderDiscount) || 0,
        payments: validPays,
        doctor: doctor.trim() || undefined,
        remark: remark.trim() || undefined,
        performances: validPerfs,
      });
      toast.success("收费单已生成");
      setShowCreate(false);
      resetCreate();
      utils.yabanCustomer.listCharges.invalidate({ customerId });
      utils.yabanCustomer.chargeStats.invalidate({ customerId });
    } catch (e: any) {
      toast.error(e.message || "开单失败");
    } finally {
      setSubmitting(false);
    }
  }, [items, payments, perfs, orderDiscount, doctor, remark, customerId, createMutation, utils, resetCreate]);

  // ============ 详情/补收/作废弹层 ============
  const [detailId, setDetailId] = useState<number | null>(null);
  const detailQuery = trpc.yabanCustomer.chargeDetail.useQuery(
    { id: detailId || 0 },
    { enabled: !!detailId, refetchOnWindowFocus: false }
  );
  const detail = detailQuery.data as any;

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleMethod, setSettleMethod] = useState("现金");
  const [settleAmount, setSettleAmount] = useState("");

  const handleSettle = useCallback(async () => {
    if (!detailId) return;
    const amt = parseFloat(settleAmount) || 0;
    if (amt <= 0) {
      toast.error("请输入补收金额");
      return;
    }
    try {
      await settleMutation.mutateAsync({ id: detailId, method: settleMethod, amount: amt });
      toast.success("补收成功");
      setSettleOpen(false);
      setSettleAmount("");
      utils.yabanCustomer.chargeDetail.invalidate({ id: detailId });
      utils.yabanCustomer.listCharges.invalidate({ customerId });
      utils.yabanCustomer.chargeStats.invalidate({ customerId });
    } catch (e: any) {
      toast.error(e.message || "补收失败");
    }
  }, [detailId, settleAmount, settleMethod, settleMutation, utils, customerId]);

  const handleVoid = useCallback(async () => {
    if (!detailId) return;
    if (!window.confirm("确定作废这张收费单吗？作废后不计入统计，且不可恢复。")) return;
    try {
      await voidMutation.mutateAsync({ id: detailId });
      toast.success("已作废");
      setDetailId(null);
      utils.yabanCustomer.listCharges.invalidate({ customerId });
      utils.yabanCustomer.chargeStats.invalidate({ customerId });
    } catch (e: any) {
      toast.error(e.message || "作废失败");
    }
  }, [detailId, voidMutation, utils, customerId]);

  const stats = statsQuery.data || { totalReceivable: 0, totalPaid: 0, totalOwed: 0 };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="P329" />

      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${customerId}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">收费记录</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="w-8" />
        </div>
      </div>

      {/* 统计卡 */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl shadow-sm p-3 flex flex-col items-center">
            <CircleDollarSign className="w-5 h-5 text-sky-500 mb-1" />
            <span className="text-[11px] text-gray-400">消费总额</span>
            <span className="text-base font-bold text-gray-800 mt-0.5">{money(stats.totalReceivable)}</span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-3 flex flex-col items-center">
            <Wallet className="w-5 h-5 text-green-500 mb-1" />
            <span className="text-[11px] text-gray-400">已收</span>
            <span className="text-base font-bold text-green-600 mt-0.5">{money(stats.totalPaid)}</span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-3 flex flex-col items-center">
            <AlertTriangle className="w-5 h-5 text-orange-500 mb-1" />
            <span className="text-[11px] text-gray-400">欠费</span>
            <span className={`text-base font-bold mt-0.5 ${stats.totalOwed > 0 ? "text-orange-600" : "text-gray-800"}`}>
              {money(stats.totalOwed)}
            </span>
          </div>
        </div>
      </div>

      {/* 历史收费单列表 */}
      <div className="px-4 pt-4">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : charges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Receipt className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无收费记录</p>
            {canCharge && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-5 py-2 bg-sky-500 text-white rounded-full text-sm font-medium"
              >
                去开单
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {charges.map((c) => {
              const st = STATUS_MAP[c.status] || STATUS_MAP.unpaid;
              return (
                <button
                  key={c.id}
                  onClick={() => setDetailId(c.id)}
                  className="w-full text-left bg-white rounded-2xl shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-400">{c.visitAt || c.createdAt}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className={`text-sm font-medium mb-2 line-clamp-1 ${c.status === "void" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                    {c.summary || "收费单"}
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>应收 <span className="text-gray-700 font-medium">{money(c.receivable)}</span></span>
                      {c.owed > 0 && c.status !== "void" && (
                        <span className="text-orange-500">欠 {money(c.owed)}</span>
                      )}
                    </div>
                    <span className="text-base font-bold text-sky-600">¥{money(c.paid)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部开单按钮 */}
      {canCharge && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-20">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-1.5 bg-sky-500 text-white rounded-full py-3 font-medium"
          >
            <Plus className="w-5 h-5" />
            快速收费
          </button>
        </div>
      )}

      {/* ============ 快速收费弹层 ============ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
          <div className="mt-auto bg-[#F0F4F8] rounded-t-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-3xl">
              <span className="text-base font-bold text-gray-800">快速收费</span>
              <button onClick={() => setShowCreate(false)} className="p-1">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* 收费项目 */}
              <div className="bg-white rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">收费项目</span>
                  <button
                    onClick={() => setItems((prev) => [...prev, { name: "", tooth: "", unitPrice: "", quantity: "1", discount: "100" }])}
                    className="flex items-center gap-0.5 text-sky-500 text-xs"
                  >
                    <Plus className="w-4 h-4" /> 添加项目
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-xl p-2.5 bg-[#FAFCFE]">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={it.name}
                          onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)))}
                          placeholder="项目名称，如 树脂补牙"
                          className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                        />
                        <button
                          onClick={() => setProdPickerIdx(idx)}
                          className="shrink-0 flex items-center gap-0.5 text-xs text-sky-600 border border-sky-200 rounded-lg px-2 py-1.5 bg-sky-50 active:bg-sky-100"
                        >
                          <Search className="w-3.5 h-3.5" /> 项目库
                        </button>
                        {items.length > 1 && (
                          <button
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-gray-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400">牙位</label>
                          <button
                            onClick={() => setToothPickerIdx(idx)}
                            className={`w-full text-sm px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-left truncate ${it.tooth ? "text-gray-700" : "text-gray-300"}`}
                          >
                            {it.tooth || "选牙位"}
                          </button>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400">单价</label>
                          <input
                            value={it.unitPrice}
                            onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, unitPrice: e.target.value } : p)))}
                            inputMode="decimal"
                            placeholder="0"
                            className="w-full text-sm px-1.5 py-1 rounded-lg border border-gray-200 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400">数量</label>
                          <input
                            value={it.quantity}
                            onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: e.target.value } : p)))}
                            inputMode="decimal"
                            placeholder="1"
                            className="w-full text-sm px-1.5 py-1 rounded-lg border border-gray-200 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400">折扣%</label>
                          <input
                            value={it.discount}
                            onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, discount: e.target.value } : p)))}
                            inputMode="decimal"
                            placeholder="100"
                            className="w-full text-sm px-1.5 py-1 rounded-lg border border-gray-200 bg-white"
                          />
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500 mt-1.5">
                        小计 <span className="text-sky-600 font-medium">¥{money(calcSubtotal(it))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 整单立减 */}
              <div className="bg-white rounded-2xl p-3 flex items-center justify-between">
                <span className="text-sm text-gray-700">整单立减</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">¥</span>
                  <input
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-24 text-sm px-2 py-1.5 rounded-lg border border-gray-200 text-right"
                  />
                </div>
              </div>

              {/* 支付方式（组合支付） */}
              <div className="bg-white rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">收款方式</span>
                  <button
                    onClick={() => setPayments((prev) => [...prev, { method: "现金", amount: "" }])}
                    className="flex items-center gap-0.5 text-sky-500 text-xs"
                  >
                    <Plus className="w-4 h-4" /> 组合支付
                  </button>
                </div>
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={p.method}
                        onChange={(e) => setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, method: e.target.value } : x)))}
                        className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                      >
                        {PAY_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <div className="flex-1 flex items-center gap-1 border border-gray-200 rounded-lg px-2 bg-white">
                        <span className="text-gray-400 text-sm">¥</span>
                        <input
                          value={p.amount}
                          onChange={(e) => setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
                          inputMode="decimal"
                          placeholder="0"
                          className="flex-1 min-w-0 text-sm py-1.5 text-right"
                        />
                      </div>
                      {payments.length > 1 && (
                        <button onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-300">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setPayments((prev) => prev.map((x, i) => (i === 0 ? { ...x, amount: String(calc.receivable) } : x)))}
                  className="mt-2 text-xs text-sky-500"
                >
                  按应收全额填入第一笔
                </button>
              </div>

              {/* 主治医生 / 备注 */}
              <div className="bg-white rounded-2xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 w-16 shrink-0">主治医生</span>
                  <input
                    value={doctor}
                    onChange={(e) => setDoctor(e.target.value)}
                    placeholder="选填"
                    className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-gray-200"
                  />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm text-gray-700 w-16 shrink-0 pt-1.5">备注</span>
                  <textarea
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="选填"
                    rows={2}
                    className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-gray-200 resize-none"
                  />
                </div>
              </div>

              {/* 业绩分配 */}
              <div className="bg-white rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                    <Award className="w-4 h-4 text-sky-500" /> 业绩分配
                    <span className="text-[11px] text-gray-400 font-normal">（选填，可多人）</span>
                  </span>
                  <button
                    onClick={() => setPerfs((prev) => [...prev, { staffId: null, staffName: "", roleKey: "", shareType: "percent", shareValue: "" }])}
                    className="flex items-center gap-0.5 text-sky-500 text-xs"
                  >
                    <Plus className="w-4 h-4" /> 添加人员
                  </button>
                </div>
                {perfs.length === 0 ? (
                  <div className="text-xs text-gray-300 py-1">未分配。点击「添加人员」为医生、护士等记录业绩。</div>
                ) : (
                  <div className="space-y-2">
                    {perfs.map((pf, idx) => {
                      const pct = pf.shareType === "percent";
                      const amt = pct
                        ? Math.round(calc.receivable * ((parseFloat(pf.shareValue) || 0) / 100) * 100) / 100
                        : Math.round((parseFloat(pf.shareValue) || 0) * 100) / 100;
                      return (
                        <div key={idx} className="border border-gray-100 rounded-xl p-2.5 bg-[#FAFCFE]">
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4 text-gray-300 shrink-0" />
                            <select
                              value={pf.staffId != null ? String(pf.staffId) : (pf.staffName ? `name:${pf.staffName}` : "")}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPerfs((prev) => prev.map((p, i) => {
                                  if (i !== idx) return p;
                                  if (!v) return { ...p, staffId: null, staffName: "", roleKey: "" };
                                  const m = members.find((mm) => String(mm.userId) === v);
                                  if (m) return { ...p, staffId: m.userId, staffName: m.name, roleKey: m.roleKey };
                                  return p;
                                }));
                              }}
                              className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                            >
                              <option value="">选择员工</option>
                              {members.map((m) => (
                                <option key={m.userId} value={String(m.userId)}>
                                  {m.name}{m.roleName ? `（${m.roleName}）` : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => setPerfs((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-gray-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex bg-gray-100 rounded-lg p-0.5">
                              {(["percent", "amount"] as const).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => setPerfs((prev) => prev.map((p, i) => (i === idx ? { ...p, shareType: t } : p)))}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${pf.shareType === t ? "bg-white shadow-sm text-sky-600" : "text-gray-400"}`}
                                >
                                  {t === "percent" ? "按比例" : "按金额"}
                                </button>
                              ))}
                            </div>
                            <div className="flex-1 flex items-center gap-1 border border-gray-200 rounded-lg px-2 bg-white">
                              <input
                                value={pf.shareValue}
                                onChange={(e) => setPerfs((prev) => prev.map((p, i) => (i === idx ? { ...p, shareValue: e.target.value } : p)))}
                                inputMode="decimal"
                                placeholder={pct ? "如 50" : "如 200"}
                                className="flex-1 min-w-0 text-sm py-1.5 text-right"
                              />
                              <span className="text-gray-400 text-sm shrink-0">{pct ? "%" : "元"}</span>
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-500 mt-1.5">
                            计业绩 <span className="text-sky-600 font-medium">¥{money(amt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 底部金额汇总 + 提交 */}
            <div className="bg-white border-t border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>合计 ¥{money(calc.total)}</span>
                <span>应收 <span className="text-gray-800 font-medium">¥{money(calc.receivable)}</span></span>
                {calc.owed > 0 ? (
                  <span className="text-orange-500">欠费 ¥{money(calc.owed)}</span>
                ) : (
                  <span className="text-green-500">找零 ¥{money(calc.change)}</span>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 bg-sky-500 text-white rounded-full py-3 font-medium disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                确认收费
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 收费单详情弹层 ============ */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
          <div className="mt-auto bg-[#F0F4F8] rounded-t-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-3xl">
              <span className="text-base font-bold text-gray-800">收费单详情</span>
              <button onClick={() => setDetailId(null)} className="p-1">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {detailQuery.isLoading || !detail ? (
                <div className="flex justify-center py-16 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">单号 {detail.chargeNo}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${(STATUS_MAP[detail.status] || STATUS_MAP.unpaid).cls}`}>
                        {(STATUS_MAP[detail.status] || STATUS_MAP.unpaid).label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mb-3">{detail.visitAt || detail.createdAt}</div>
                    {/* 项目明细 */}
                    <div className="space-y-2">
                      {detail.items.map((it: any) => (
                        <div key={it.id} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <span className="text-gray-800">{it.name}</span>
                            {it.tooth && <span className="text-gray-400 ml-1 text-xs">[{it.tooth}]</span>}
                            <span className="text-gray-400 ml-1 text-xs">
                              {money(it.unitPrice)}×{it.quantity}{it.discount < 100 ? ` ${it.discount}折` : ""}
                            </span>
                          </div>
                          <span className="text-gray-700 font-medium shrink-0 ml-2">¥{money(it.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 mt-3 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-gray-500"><span>合计</span><span>¥{money(detail.totalAmount)}</span></div>
                      {detail.discountAmount > 0 && (
                        <div className="flex justify-between text-gray-500"><span>整单立减</span><span>-¥{money(detail.discountAmount)}</span></div>
                      )}
                      <div className="flex justify-between text-gray-700 font-medium"><span>应收</span><span>¥{money(detail.receivable)}</span></div>
                      <div className="flex justify-between text-green-600"><span>已收</span><span>¥{money(detail.paid)}</span></div>
                      {detail.owed > 0 && (
                        <div className="flex justify-between text-orange-600"><span>欠费</span><span>¥{money(detail.owed)}</span></div>
                      )}
                      {detail.changeAmount > 0 && (
                        <div className="flex justify-between text-gray-500"><span>找零</span><span>¥{money(detail.changeAmount)}</span></div>
                      )}
                    </div>
                  </div>

                  {/* 支付明细 */}
                  {detail.payments.length > 0 && (
                    <div className="bg-white rounded-2xl p-4">
                      <span className="text-sm font-medium text-gray-700">收款明细</span>
                      <div className="mt-2 space-y-1.5">
                        {detail.payments.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{p.method}</span>
                            <span className="text-gray-400 text-xs flex-1 text-center">{p.paidAt}</span>
                            <span className="text-gray-700 font-medium">¥{money(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 业绩分配明细 */}
                  {detail.performances && detail.performances.length > 0 && (
                    <div className="bg-white rounded-2xl p-4">
                      <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                        <Award className="w-4 h-4 text-sky-500" /> 业绩分配
                      </span>
                      <div className="mt-2 space-y-1.5">
                        {detail.performances.map((pf: any) => (
                          <div key={pf.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{pf.staffName}</span>
                            <span className="text-gray-400 text-xs flex-1 text-center">
                              {pf.shareType === "percent" ? `${pf.shareValue}%` : `按金额`}
                            </span>
                            <span className="text-sky-600 font-medium">¥{money(pf.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 医生/备注 */}
                  {(detail.doctor || detail.cashierName || detail.remark) && (
                    <div className="bg-white rounded-2xl p-4 text-sm space-y-1.5">
                      {detail.doctor && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">主治医生</span><span className="text-gray-700">{detail.doctor}</span></div>}
                      {detail.cashierName && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">收费人</span><span className="text-gray-700">{detail.cashierName}</span></div>}
                      {detail.remark && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">备注</span><span className="text-gray-700">{detail.remark}</span></div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 详情底部操作 */}
            {canCharge && detail && detail.status !== "void" && (
              <div className="bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
                <button
                  onClick={handleVoid}
                  className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm"
                >
                  <Ban className="w-4 h-4" /> 作废
                </button>
                {detail.owed > 0 && (
                  <button
                    onClick={() => { setSettleAmount(String(detail.owed)); setSettleMethod("现金"); setSettleOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-1 bg-sky-500 text-white rounded-full py-2.5 text-sm font-medium"
                  >
                    <Wallet className="w-4 h-4" /> 补收欠款 ¥{money(detail.owed)}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ 补收弹层 ============ */}
      {settleOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-bold text-gray-800">补收欠款</span>
              <button onClick={() => setSettleOpen(false)} className="p-1"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">收款方式</label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="w-full mt-1 text-sm px-2 py-2 rounded-lg border border-gray-200 bg-white"
                >
                  {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">收款金额</label>
                <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 mt-1">
                  <span className="text-gray-400 text-sm">¥</span>
                  <input
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    inputMode="decimal"
                    className="flex-1 min-w-0 text-sm py-2 text-right"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleSettle}
              className="w-full mt-4 bg-sky-500 text-white rounded-full py-2.5 text-sm font-medium"
            >
              确认补收
            </button>
          </div>
        </div>
      )}

      {/* 图形牙位选择器 */}
      <ToothPicker
        open={toothPickerIdx !== null}
        value={toothPickerIdx !== null ? items[toothPickerIdx]?.tooth || "" : ""}
        onClose={() => setToothPickerIdx(null)}
        onConfirm={(code) => {
          if (toothPickerIdx !== null) {
            const idx = toothPickerIdx;
            setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, tooth: code } : p)));
          }
          setToothPickerIdx(null);
        }}
      />

      {/* 收费项目库选择器 */}
      <ChargeProductPicker
        open={prodPickerIdx !== null}
        onClose={() => setProdPickerIdx(null)}
        onPick={(prod: ChargeProductPick) => {
          if (prodPickerIdx !== null) {
            const idx = prodPickerIdx;
            setItems((prev) =>
              prev.map((p, i) =>
                i === idx
                  ? { ...p, name: prod.name, unitPrice: prod.price > 0 ? String(prod.price) : p.unitPrice }
                  : p
              )
            );
          }
          setProdPickerIdx(null);
        }}
      />
    </div>
  );
}
