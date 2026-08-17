import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, Plus, ShieldCheck, Pencil, Trash2, X, Check, Landmark, FileText, PhoneCall } from "lucide-react";
import { LoanServiceContactSheet } from "@/components/LoanServiceContactSheet";
import { getHuabeiServiceContact, getPolicyLoanServiceContact, type LoanServiceContact } from "@/lib/loanServiceContacts";

type LoanSort = "default" | "dueDate" | "rate" | "amount";

interface PolicyLoanManagementProps {
  /** 嵌入贷款管理页时隐藏独立页头并使用父级滚动容器 */
  embedded?: boolean;
  /** 保单贷款卡片排序方式 */
  sortBy?: LoanSort;
  /** 父组件每次递增该值即可打开新增保单贷款表单 */
  addRequestId?: number;
  /** 管理员的全员视角 */
  adminMode?: boolean;
  targetUser?: { id: number; name: string } | null;
  /** 通用贷款类型：保单贷款或花呗 */
  loanType?: "policy" | "huabei";
  /** 在“全部”筛选中无记录时不单独显示空状态 */
  showEmpty?: boolean;
}

interface PolicyLoanForm {
  insurer: string;
  policyName: string;
  policyHolder: string;
  policyNo: string;
  loanAmount: string;
  outstandingBalance: string;
  annualRate: string;
  repaymentMethod: string;
  loanDate: string;
  dueDate: string;
  note: string;
}

const emptyForm: PolicyLoanForm = {
  insurer: "", policyName: "", policyHolder: "", policyNo: "",
  loanAmount: "", outstandingBalance: "", annualRate: "", repaymentMethod: "",
  loanDate: "", dueDate: "", note: "",
};

const INSURERS = ["中国人寿", "平安人寿", "太平洋人寿", "新华保险", "泰康人寿", "友邦保险", "香港保险公司", "其他保险公司"];
const REPAYMENT_METHODS = [
  "到期本利一次性归还",
  "到期还本、按期付息",
  "按月等额本息",
  "按月等额本金",
  "按季付息、到期还本",
  "按年付息、到期还本",
  "随时还款 / 不定期还息",
  "其他",
];

function formatAmount(value: unknown) {
  const amount = Number(value || 0);
  return `¥${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(value: unknown) {
  if (!value) return "未设置";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  return y && m && d ? `${y}.${m}.${d}` : raw;
}

export default function PolicyLoanManagement({
  embedded = false,
  sortBy = "default",
  addRequestId = 0,
  adminMode = false,
  targetUser = null,
  loanType = "policy",
  showEmpty = true,
}: PolicyLoanManagementProps) {
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyLoanForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [serviceContact, setServiceContact] = useState<LoanServiceContact | null>(null);
  const isHuabei = loanType === "huabei";
  const loanLabel = isHuabei ? "花呗" : "保单贷款";
  const loanHolderLabel = isHuabei ? "使用人" : "投保人 / 持有人";

  const { data: myLoans = [], refetch: refetchMy } = trpc.policyLoan.list.useQuery({ loanType }, { enabled: !adminMode });
  const { data: allLoans = [], refetch: refetchAll } = trpc.policyLoan.adminListAll.useQuery({ loanType }, { enabled: adminMode });
  const refetch = () => { refetchMy(); refetchAll(); };
  const sourceLoans = (adminMode ? allLoans : myLoans) as any[];

  const createMutation = trpc.policyLoan.create.useMutation({
    onSuccess: () => { toast.success(`${loanLabel}已添加`); refetch(); setShowForm(false); setForm(emptyForm); },
    onError: (e) => toast.error(`添加失败: ${e.message || ""}`),
  });
  const adminCreateMutation = trpc.policyLoan.adminCreate.useMutation({
    onSuccess: () => { toast.success(`已为该用户添加${loanLabel}`); refetch(); setShowForm(false); setForm(emptyForm); },
    onError: (e) => toast.error(`添加失败: ${e.message || ""}`),
  });
  const updateMutation = trpc.policyLoan.update.useMutation({
    onSuccess: () => { toast.success(`${loanLabel}已更新`); refetch(); setShowForm(false); setEditingId(null); setForm(emptyForm); },
    onError: (e) => toast.error(`更新失败: ${e.message || ""}`),
  });
  const deleteMutation = trpc.policyLoan.delete.useMutation({
    onSuccess: () => { toast.success("保单贷款已删除"); refetch(); setDeleteId(null); setDeleteStep(1); },
    onError: (e) => toast.error(`删除失败: ${e.message || ""}`),
  });
  const adminDeleteMutation = trpc.policyLoan.adminDelete.useMutation({
    onSuccess: () => { toast.success("已删除"); refetch(); setDeleteId(null); setDeleteStep(1); },
    onError: (e) => toast.error(`删除失败: ${e.message || ""}`),
  });

  const sortedLoans = useMemo(() => [...sourceLoans].sort((a, b) => {
    // 默认与“按到期日”均采用最近到期优先；没有到期日的贷款统一排在末尾。
    if (sortBy === "default" || sortBy === "dueDate") {
      const aDate = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate === bDate ? Number(b.id || 0) - Number(a.id || 0) : aDate - bDate;
    }
    if (sortBy === "rate") return Number(b.annual_rate || -1) - Number(a.annual_rate || -1);
    if (sortBy === "amount") return Number(b.loan_amount || 0) - Number(a.loan_amount || 0);
    return 0;
  }), [sourceLoans, sortBy]);

  const annualInterest = useMemo(() => {
    const balance = Number(form.outstandingBalance || form.loanAmount || 0);
    const rate = Number(form.annualRate || 0);
    return balance > 0 && rate > 0 ? balance * rate / 100 : 0;
  }, [form.outstandingBalance, form.loanAmount, form.annualRate]);

  const openAdd = () => {
    if (adminMode && !targetUser) {
      toast.error(`请先选择要添加${loanLabel}的用户`);
      return;
    }
    setEditingId(null);
    setForm(isHuabei ? { ...emptyForm, insurer: "支付宝·花呗" } : emptyForm);
    setShowForm(true);
  };

  useEffect(() => {
    if (addRequestId > 0) openAdd();
    // addRequestId 只用于父组件触发新增，避免因对象变动重复打开。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequestId]);

  const openEdit = (loan: any) => {
    setEditingId(Number(loan.id));
    setForm({
      insurer: loan.insurer || "", policyName: loan.policy_name || "", policyHolder: loan.policy_holder || "",
      policyNo: loan.policy_no || "", loanAmount: loan.loan_amount != null ? String(loan.loan_amount) : "",
      outstandingBalance: loan.outstanding_balance != null ? String(loan.outstanding_balance) : "",
      annualRate: loan.annual_rate != null ? String(loan.annual_rate) : "",
      repaymentMethod: loan.repayment_method || "",
      loanDate: loan.loan_date ? String(loan.loan_date).slice(0, 10) : "", dueDate: loan.due_date ? String(loan.due_date).slice(0, 10) : "",
      note: loan.note || "",
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.insurer.trim()) { toast.error("请选择保险公司"); return; }
    if (!form.policyHolder.trim()) { toast.error("请填写投保人 / 持有人"); return; }
    if (!form.loanAmount || Number(form.loanAmount) <= 0) { toast.error("请填写有效的贷款金额"); return; }
    if (form.annualRate.trim() === "") { toast.error("请填写贷款年利率"); return; }
    const payload = {
      insurer: form.insurer.trim(), policyName: form.policyName || undefined, policyHolder: form.policyHolder || undefined,
      policyNo: form.policyNo || undefined, loanAmount: form.loanAmount ? Number(form.loanAmount) : undefined,
      outstandingBalance: form.outstandingBalance ? Number(form.outstandingBalance) : undefined,
      annualRate: form.annualRate ? Number(form.annualRate) : 0,
      repaymentMethod: form.repaymentMethod || undefined, loanDate: form.loanDate || undefined, dueDate: form.dueDate || undefined,
      currency: "CNY", note: form.note || undefined, loanType,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else if (adminMode) {
      if (!targetUser) { toast.error("请先选择用户"); return; }
      adminCreateMutation.mutate({ targetUserId: targetUser.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const listContent = (
    <>
      {sortedLoans.length === 0 ? (showEmpty && <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <ShieldCheck className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">暂无{loanLabel}</p>
        <p className="text-xs mt-1">点击右上角 + 添加</p>
      </div>) : sortedLoans.map((loan: any) => {
        const balance = loan.outstanding_balance != null ? Number(loan.outstanding_balance) : Number(loan.loan_amount || 0);
        const annual = balance * Number(loan.annual_rate || 0) / 100;
        return (
          <div key={loan.id} className="rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100">
            <div className="relative bg-gradient-to-br from-[#17345E] to-[#27507D] p-4 pb-10 text-white">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-white/65 text-xs mb-1"><span className="rounded border border-white/30 bg-white/10 px-1.5 text-[10px] font-semibold leading-4 text-white/85">{loanLabel}</span><ShieldCheck className="w-3.5 h-3.5" /><span>{loan.insurer}</span></div>
                  <p className="font-semibold text-base truncate">{loan.policy_name || loanLabel}</p>
                  <p className="text-xs text-white/60 mt-1">{adminMode && loan.user_name ? `${loan.user_name} · ` : ""}{loan.policy_holder || `未填写${loanHolderLabel}`}{loan.policy_no ? ` · ${loan.policy_no}` : ""}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!adminMode && <button onClick={() => openEdit(loan)} className="w-7 h-7 flex items-center justify-center text-white/70 active:text-white" aria-label="编辑"><Pencil className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => { setDeleteId(loan.id); setDeleteStep(1); }} className="w-7 h-7 flex items-center justify-center text-white/70 active:text-white" aria-label="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><p className="text-white/60 text-xs">当前贷款余额</p><p className="text-2xl font-bold mt-0.5">{formatAmount(balance)}</p></div>
                <div className="text-right"><p className="text-white/60 text-xs">年利率</p><p className="text-lg font-semibold mt-0.5">{loan.annual_rate != null ? `${Number(loan.annual_rate).toFixed(2)}%` : "未设置"}</p></div>
              </div>
              <button onClick={() => setServiceContact(isHuabei ? getHuabeiServiceContact() : getPolicyLoanServiceContact(loan.insurer))} className="absolute bottom-2.5 right-3 flex h-7 w-7 items-center justify-center text-white/85 active:text-white" aria-label="查看官方客服电话"><PhoneCall className="h-4 w-4" /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><p className="text-gray-400 text-xs">贷款金额</p><p className="text-gray-800 font-semibold mt-0.5">{loan.loan_amount != null ? formatAmount(loan.loan_amount) : "未设置"}</p></div>
              <div><p className="text-gray-400 text-xs">年化利息预估</p><p className="text-rose-500 font-semibold mt-0.5">{loan.annual_rate != null ? formatAmount(annual) : "未设置"}</p></div>
              <div><p className="text-gray-400 text-xs">贷款到期日</p><p className="text-gray-800 font-semibold mt-0.5">{formatDate(loan.due_date)}</p></div>
              <div className="col-span-2"><p className="text-gray-400 text-xs">还款方式</p><p className="text-gray-800 font-semibold mt-0.5">{loan.repayment_method || "未设置"}</p></div>
            </div>
            {loan.note && <div className="px-4 py-2.5 border-t border-slate-100 flex gap-1.5 text-xs text-gray-500"><FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{loan.note}</span></div>}
          </div>
        );
      })}
    </>
  );

  return (
    <>
      {!embedded ? (
        <div className="flex flex-col h-screen bg-[#1A2B4A] max-w-[480px] mx-auto">
          <div className="bg-[#1A2B4A] text-white p-3 flex items-center justify-between flex-shrink-0">
            <button onClick={() => setLocation("/credit-cards")} aria-label="返回贷款管理"><ChevronLeft className="w-5 h-5" /></button>
            <div className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-amber-300" /><h1 className="text-base font-semibold">贷款管理 · {loanLabel}</h1></div>
            <button onClick={openAdd} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30" aria-label={`添加${loanLabel}`}><Plus className="w-4 h-4" /></button>
          </div>
          <div className="bg-white/10 px-4 py-2.5 text-white/75 text-xs flex items-center gap-2"><Landmark className="w-3.5 h-3.5 text-amber-300" /><span>{isHuabei ? "管理花呗额度、待还余额、费率及还款日" : "管理保单贷款余额、现金价值、年利率及到期日"}</span></div>
          <main className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F6F7FB]">{listContent}</main>
        </div>
      ) : (
        <section className="space-y-3">{listContent}</section>
      )}

      {showForm && <div className="fixed inset-0 z-50 flex justify-center items-end overflow-hidden" style={{ background: "rgba(0,0,0,.5)" }}>
        <div className="w-full max-w-[480px] bg-white rounded-t-2xl max-h-[90dvh] overflow-x-hidden overflow-y-auto shadow-2xl">
          <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100"><div><h2 className="font-semibold text-gray-800">{editingId ? `编辑${loanLabel}` : `添加${loanLabel}`}</h2><p className="text-xs text-gray-400 mt-0.5">带 * 的信息将用于建立贷款档案</p></div><button onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-5 h-5 text-gray-400" /></button></div>
          <div className="p-4 space-y-4 overflow-x-hidden">
            {isHuabei ? <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><span className="text-xs text-gray-500">贷款平台</span><span className="text-xs font-semibold text-[#1A2B4A]">支付宝 · 花呗</span></div> : <div><label className="text-xs text-gray-500 block mb-1.5">保险公司 *</label><select value={form.insurer} onChange={e => setForm(f => ({ ...f, insurer: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"><option value="">选择保险公司</option>{INSURERS.map(v => <option key={v} value={v}>{v}</option>)}</select></div>}
            <div><label className="text-xs text-gray-500 block mb-1.5">{isHuabei ? "花呗账户名称（选填）" : "保单名称（选填）"}</label><input value={form.policyName} onChange={e => setForm(f => ({ ...f, policyName: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder={isHuabei ? "如：个人花呗" : "如：某某终身寿险"} /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-gray-500 block mb-1.5">{loanHolderLabel} *</label><input value={form.policyHolder} onChange={e => setForm(f => ({ ...f, policyHolder: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="姓名" /></div><div><label className="text-xs text-gray-500 block mb-1.5">{isHuabei ? "账户标识（选填）" : "保单号（选填）"}</label><input value={form.policyNo} onChange={e => setForm(f => ({ ...f, policyNo: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="可选" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-gray-500 block mb-1.5">贷款金额 *</label><input type="number" value={form.loanAmount} onChange={e => setForm(f => ({ ...f, loanAmount: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="0" /></div><div><label className="text-xs text-gray-500 block mb-1.5">当前贷款余额（选填）</label><input type="number" value={form.outstandingBalance} onChange={e => setForm(f => ({ ...f, outstandingBalance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="0" /></div></div>
            <div><label className="text-xs text-gray-500 block mb-1.5">贷款年利率（%） *</label><input type="number" step="0.01" value={form.annualRate} onChange={e => setForm(f => ({ ...f, annualRate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="如：4.75" /></div>
            {annualInterest > 0 && <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">按当前贷款余额估算，年化利息约 <span className="font-semibold">{formatAmount(annualInterest)}</span>。</div>}
            <div><label className="text-xs text-gray-500 block mb-1.5">还款方式</label><select value={form.repaymentMethod} onChange={e => setForm(f => ({ ...f, repaymentMethod: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"><option value="">选择还款方式</option>{REPAYMENT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}</select></div>
            <div className="grid min-w-0 grid-cols-2 gap-2"><div className="min-w-0"><label className="mb-1 block text-xs leading-4 text-gray-500">贷款日期</label><input type="date" value={form.loanDate} onChange={e => setForm(f => ({ ...f, loanDate: e.target.value }))} className="!h-9 !min-h-0 block w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-0 text-[11px] leading-none" /></div><div className="min-w-0"><label className="mb-1 block text-xs leading-4 text-gray-500">到期日</label><input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="!h-9 !min-h-0 block w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-0 text-[11px] leading-none" /></div></div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><span className="text-xs text-gray-500">计价币种</span><span className="text-xs font-semibold text-[#1A2B4A]">人民币（CNY）</span></div>
            <div><label className="text-xs text-gray-500 block mb-1.5">备注</label><textarea rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none" placeholder="如：利息支付方式、续期约定等" /></div>
            <button disabled={createMutation.isPending || updateMutation.isPending || adminCreateMutation.isPending} onClick={submit} className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-[#1A2B4A] to-[#2D5C8F]"><Check className="w-4 h-4" /><span>{editingId ? "保存修改" : `添加${loanLabel}`}</span></button>
          </div>
        </div>
      </div>}

      {serviceContact && <LoanServiceContactSheet contact={serviceContact} open={true} onClose={() => setServiceContact(null)} />}
      {deleteId !== null && <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }}><div className="bg-white rounded-2xl p-6 mx-6 w-full max-w-xs">{deleteStep === 1 ? <><p className="text-gray-800 font-semibold text-center mb-2">删除{loanLabel}</p><p className="text-gray-500 text-sm text-center mb-5">确定要删除这笔{loanLabel}吗？</p><div className="flex gap-3"><button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm">取消</button><button onClick={() => setDeleteStep(2)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-white text-sm">继续</button></div></> : <><p className="text-red-500 font-semibold text-center mb-2">再次确认删除</p><p className="text-gray-500 text-sm text-center mb-5">删除后数据不可恢复，请确认操作。</p><div className="flex gap-3"><button onClick={() => { setDeleteId(null); setDeleteStep(1); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm">取消</button><button onClick={() => { if (adminMode) adminDeleteMutation.mutate({ id: deleteId }); else deleteMutation.mutate({ id: deleteId }); }} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm">确认删除</button></div></>}</div></div>}
    </>
  );
}
