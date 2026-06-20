import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Plus, Building2, Pencil, Trash2, Clock, CheckCircle, XCircle,
  ChevronRight, FileText, List, X, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCenterToast } from "@/components/ui/center-toast";
import { EXPENSE_CATEGORIES, getDefaultExpenseConfig } from "./AJCompanyManager";

type RequestType = 'add' | 'update' | 'delete';

type CompanyFormData = {
  name: string;
  tax_no: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  remark: string;
};

// ========== 报销类型配置面板（企业主版）==========
function ExpenseTypePanel({
  ledgerId,
  company,
  onClose,
}: {
  ledgerId: number;
  company: { id: number; name: string };
  onClose: () => void;
}) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const { data: savedConfig, isLoading } = trpc.ledger.ajGetCompanyExpenseTypes.useQuery({
    ledgerId,
    companyId: company.id,
  });
  const [config, setConfig] = useState<Record<string, { enabled: boolean; items: Record<string, boolean> }> | null>(null);
  const effectiveConfig = config ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
  const saveMutation = trpc.ledger.ajSetCompanyExpenseTypes.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanyExpenseTypes.invalidate({ ledgerId, companyId: company.id });
      toast.success("开票分类配置已保存");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleCategory = (catKey: string) => {
    setConfig({
      ...effectiveConfig,
      [catKey]: { ...effectiveConfig[catKey], enabled: !effectiveConfig[catKey].enabled },
    });
  };
  const toggleItem = (catKey: string, itemKey: string) => {
    setConfig({
      ...effectiveConfig,
      [catKey]: {
        ...effectiveConfig[catKey],
        items: { ...effectiveConfig[catKey].items, [itemKey]: !effectiveConfig[catKey].items[itemKey] },
      },
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">开票分类配置（默认全部启用）</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : (
            EXPENSE_CATEGORIES.map((cat) => {
              const catConfig = effectiveConfig[cat.key] ?? { enabled: true, items: {} };
              return (
                <div key={cat.key} className="bg-gray-50 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3"
                    onClick={() => toggleCategory(cat.key)}
                  >
                    <span className="font-medium text-gray-800 text-sm">{cat.label}</span>
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${catConfig.enabled ? 'bg-[#C0392B]' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${catConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                  {catConfig.enabled && (
                    <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                      {cat.items.map((item) => {
                        const enabled = catConfig.items[item.key] !== false;
                        return (
                          <button
                            key={item.key}
                            onClick={() => toggleItem(cat.key, item.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${enabled ? 'bg-red-50 text-[#C0392B]' : 'bg-white text-gray-400 border border-gray-100'}`}
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-[#C0392B]' : 'bg-gray-200'}`}>
                              {enabled && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <Button
            className="w-full rounded-xl bg-[#C0392B] hover:bg-[#A93226] text-white h-11"
            onClick={() => saveMutation.mutate({ ledgerId, companyId: company.id, config: effectiveConfig })}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ========== 开票记录面板（企业主简化版）==========
function InvoicePanel({
  ledgerId,
  company,
  onClose,
}: {
  ledgerId: number;
  company: { id: number; name: string };
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const { data: invoices, isLoading } = (trpc as any).ledger.ajOwnerGetCompanyInvoices.useQuery({
    ledgerId,
    companyId: company.id,
    period,
  });
  const periodLabels: Record<string, string> = { month: '本月', quarter: '本季', year: '本年', all: '全部' };
  const totalAmount = (invoices as any[] | undefined)?.reduce((s: number, r: any) => s + Number(r.amount || 0), 0) || 0;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">开票记录</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {/* 时间段切换 */}
        <div className="flex gap-2 px-4 py-3 border-b border-gray-50 flex-shrink-0">
          {(['month', 'quarter', 'year', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${period === p ? 'bg-[#C0392B] text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        {/* 汇总 */}
        {!isLoading && invoices && (
          <div className="flex items-center justify-between px-4 py-2 bg-red-50 flex-shrink-0">
            <span className="text-xs text-gray-500">共 {(invoices as any[]).length} 笔</span>
            <span className="text-sm font-bold text-[#C0392B]">¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
          ) : !invoices || (invoices as any[]).length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无开票记录</div>
            </div>
          ) : (
            (invoices as any[]).map((inv: any) => (
              <div key={inv.id} className="bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800">¥{Number(inv.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
                    {inv.description && <div className="text-xs text-gray-500 mt-0.5 truncate">{inv.description}</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      {inv.recordDate} · {inv.creatorNickname || inv.creatorName || inv.creatorUsername || '未知'}
                    </div>
                  </div>
                  <div className={`ml-2 flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                    inv.ajStatus === 'approved' ? 'bg-green-100 text-green-700' :
                    inv.ajStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {inv.ajStatus === 'approved' ? '已通过' : inv.ajStatus === 'pending' ? '待审核' : inv.ajStatus === 'rejected' ? '已拒绝' : '—'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ========== 申请表单 ==========
function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  submitLabel = '提交申请',
  showTip = false,
}: {
  initial?: Partial<CompanyFormData>;
  onSubmit: (data: CompanyFormData) => void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  showTip?: boolean;
}) {
  const [form, setForm] = useState<CompanyFormData>({
    name: initial?.name || '',
    tax_no: initial?.tax_no || '',
    address: initial?.address || '',
    phone: initial?.phone || '',
    bank_name: initial?.bank_name || '',
    bank_account: initial?.bank_account || '',
    remark: initial?.remark || '',
  });
  const set = (k: keyof CompanyFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-2.5">
      {showTip && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700 leading-relaxed">
          💡 申请通过后，所有报销分类默认全部开启。您可在企业卡片下方「开票分类」中自行勾选或取消。
        </div>
      )}
      <div>
        <div className="text-xs text-gray-500 mb-1">企业名称 <span className="text-red-500">*</span></div>
        <Input value={form.name} onChange={set('name')} placeholder="请输入企业名称" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">税号</div>
        <Input value={form.tax_no} onChange={set('tax_no')} placeholder="企业税号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">地址</div>
        <Input value={form.address} onChange={set('address')} placeholder="企业地址（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">电话</div>
        <Input value={form.phone} onChange={set('phone')} placeholder="联系电话（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">开户行</div>
        <Input value={form.bank_name} onChange={set('bank_name')} placeholder="开户银行（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">银行账号</div>
        <Input value={form.bank_account} onChange={set('bank_account')} placeholder="银行账号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">备注</div>
        <Input value={form.remark} onChange={set('remark')} placeholder="备注（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={onCancel}>
          取消
        </Button>
        <Button
          className="flex-1 rounded-xl bg-[#C0392B] hover:bg-[#A93226] text-white text-sm h-10"
          onClick={() => {
            if (!form.name.trim()) return;
            onSubmit(form);
          }}
          disabled={loading || !form.name.trim()}
        >
          {loading ? '提交中...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ========== 主页面 ==========
export default function AJOwnerCompanies() {
  const params = useParams<{ ledgerId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const [, setLocation] = useLocation();
  const toast = useCenterToast();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<'companies' | 'requests'>('companies');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<any | null>(null);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [expenseTypeCompany, setExpenseTypeCompany] = useState<{ id: number; name: string } | null>(null);
  const [invoiceCompany, setInvoiceCompany] = useState<{ id: number; name: string } | null>(null);

  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const { data: myRequests, isLoading: requestsLoading } = (trpc as any).ledger.ajOwnerGetMyRequests.useQuery({ ledgerId });
  const { data: companyStats } = (trpc as any).ledger.ajOwnerGetCompanyStats.useQuery({ ledgerId, period: 'month' });
  const statsMap: Record<number, { invoiceCount: number; totalAmount: number; salesmanCount: number }> = {};
  if (companyStats) {
    (companyStats as any[]).forEach((s: any) => {
      statsMap[s.companyId] = {
        invoiceCount: Number(s.invoiceCount || 0),
        totalAmount: Number(s.totalAmount || 0),
        salesmanCount: Number(s.salesmanCount || 0),
      };
    });
  }
  const pendingCount = (myRequests as any[] | undefined)?.filter((r: any) => r.status === 'pending').length || 0;

  const submitMutation = (trpc as any).ledger.ajOwnerSubmitRequest.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setShowAddForm(false);
      setEditingCompany(null);
      setDeletingCompany(null);
      setDeleteRemark('');
      toast.success('申请已提交，等待管理员审核');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAddSubmit = (data: CompanyFormData) => {
    submitMutation.mutate({
      ledgerId, requestType: 'add' as RequestType,
      name: data.name, taxNo: data.tax_no || undefined, address: data.address || undefined,
      phone: data.phone || undefined, bankName: data.bank_name || undefined,
      bankAccount: data.bank_account || undefined, remark: data.remark || undefined,
    });
  };
  const handleEditSubmit = (data: CompanyFormData) => {
    if (!editingCompany) return;
    submitMutation.mutate({
      ledgerId, requestType: 'update' as RequestType, companyId: editingCompany.id,
      name: data.name, taxNo: data.tax_no || undefined, address: data.address || undefined,
      phone: data.phone || undefined, bankName: data.bank_name || undefined,
      bankAccount: data.bank_account || undefined, remark: data.remark || undefined,
    });
  };
  const handleDeleteSubmit = () => {
    if (!deletingCompany) return;
    submitMutation.mutate({
      ledgerId, requestType: 'delete' as RequestType,
      companyId: deletingCompany.id, name: deletingCompany.name, remark: deleteRemark || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="bg-[#C0392B] text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold flex-1">我的企业</h1>
          {activeTab === 'companies' && (
            <button
              onClick={() => { setShowAddForm(true); setEditingCompany(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
        {/* Tab 切换 */}
        <div className="flex mt-3 rounded-xl overflow-hidden bg-white/10">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors rounded-xl ${activeTab === 'companies' ? 'bg-white text-[#C0392B]' : 'text-white/80'}`}
            onClick={() => setActiveTab('companies')}
          >
            我的企业
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors rounded-xl ${activeTab === 'requests' ? 'bg-white text-[#C0392B]' : 'text-white/80'}`}
            onClick={() => setActiveTab('requests')}
          >
            {/* 角标用 inline-flex 对齐，避免 absolute 偏移 */}
            <span className="inline-flex items-center justify-center gap-1.5">
              申请记录
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-amber-400 text-white text-[10px] rounded-full leading-none flex-shrink-0">
                  {pendingCount}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ===== 我的企业 Tab ===== */}
        {activeTab === 'companies' && (
          <>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
              您名下的企业需经管理员审核后生效。添加、修改、删除均需提交申请。
            </div>

            {/* 新增企业表单 */}
            {showAddForm && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="text-sm font-medium text-gray-700 mb-3">申请新增企业</div>
                <CompanyForm
                  showTip={true}
                  onSubmit={handleAddSubmit}
                  onCancel={() => setShowAddForm(false)}
                  loading={submitMutation.isPending}
                  submitLabel="提交新增申请"
                />
              </div>
            )}

            {/* 企业列表 */}
            {companiesLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
            ) : !myCompanies || (myCompanies as any[]).length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <div className="text-gray-400 text-sm">暂无企业</div>
                <div className="text-gray-300 text-xs mt-1">点击右上角「+」申请添加企业</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(myCompanies as any[]).map((company: any) => (
                  <div key={company.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                    {editingCompany?.id === company.id ? (
                      <div className="p-4">
                        <div className="text-sm font-medium text-gray-600 mb-3">申请修改企业信息</div>
                        <CompanyForm
                          initial={{
                            name: company.name, tax_no: company.taxNo || '',
                            address: company.address || '', phone: company.phone || '',
                            bank_name: company.bankName || '', bank_account: company.bankAccount || '',
                            remark: company.remark || '',
                          }}
                          onSubmit={handleEditSubmit}
                          onCancel={() => setEditingCompany(null)}
                          loading={submitMutation.isPending}
                          submitLabel="提交修改申请"
                        />
                      </div>
                    ) : deletingCompany?.id === company.id ? (
                      <div className="p-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">申请删除「{company.name}」</div>
                        <div className="text-xs text-gray-400 mb-3">删除申请需经管理员确认后生效</div>
                        <Input
                          value={deleteRemark}
                          onChange={(e) => setDeleteRemark(e.target.value)}
                          placeholder="删除原因（选填）"
                          className="h-9 text-sm border-gray-200 rounded-xl mb-3"
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={() => setDeletingCompany(null)}>
                            取消
                          </Button>
                          <Button
                            className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm h-10"
                            onClick={handleDeleteSubmit}
                            disabled={submitMutation.isPending}
                          >
                            {submitMutation.isPending ? '提交中...' : '提交删除申请'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* 企业基本信息 */}
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-5 h-5 text-[#C0392B]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800 truncate">{company.name}</div>
                                {company.taxNo && (
                                  <div className="text-xs text-gray-400 mt-0.5 truncate">税号：{company.taxNo}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              <button
                                onClick={() => setEditingCompany(company)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                              >
                                <Pencil className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={() => { setDeletingCompany(company); setDeleteRemark(''); }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </div>
                          {(company.address || company.phone || company.bankName || company.bankAccount) && (
                            <div className="mt-3 space-y-1 pl-13">
                              {company.address && <div className="text-xs text-gray-500">地址：{company.address}</div>}
                              {company.phone && <div className="text-xs text-gray-500">电话：{company.phone}</div>}
                              {company.bankName && <div className="text-xs text-gray-500">开户行：{company.bankName}</div>}
                              {company.bankAccount && <div className="text-xs text-gray-500">账号：{company.bankAccount}</div>}
                              {company.remark && <div className="text-xs text-gray-400 italic">备注：{company.remark}</div>}
                            </div>
                          )}
                        </div>
                        {/* 本月统计数据 */}
                        {(() => {
                          const s = statsMap[company.id];
                          if (!s) return null;
                          return (
                            <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
                              <div className="bg-red-50 rounded-xl px-2 py-2 text-center">
                                <div className="text-[10px] text-gray-400 mb-0.5">本月发票</div>
                                <div className="text-sm font-bold text-[#C0392B]">{s.invoiceCount > 0 ? `${s.invoiceCount}张` : '--'}</div>
                              </div>
                              <div className="bg-red-50 rounded-xl px-2 py-2 text-center">
                                <div className="text-[10px] text-gray-400 mb-0.5">本月金额</div>
                                <div className="text-sm font-bold text-[#C0392B]">{s.totalAmount > 0 ? `¥${s.totalAmount.toFixed(0)}` : '--'}</div>
                              </div>
                              <div className="bg-red-50 rounded-xl px-2 py-2 text-center">
                                <div className="text-[10px] text-gray-400 mb-0.5">业务员</div>
                                <div className="text-sm font-bold text-[#C0392B]">{s.salesmanCount > 0 ? `${s.salesmanCount}人` : '--'}</div>
                              </div>
                            </div>
                          );
                        })()}
                        {/* 开票分类入口 */}
                        <button
                          onClick={() => setExpenseTypeCompany({ id: company.id, name: company.name })}
                          className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <List className="w-4 h-4 text-gray-400" />
                            <span>开票分类</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </button>
                        {/* 开票记录入口 */}
                        <button
                          onClick={() => setInvoiceCompany({ id: company.id, name: company.name })}
                          className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span>开票记录</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 申请记录 Tab ===== */}
        {activeTab === 'requests' && (
          <>
            {requestsLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
            ) : !myRequests || (myRequests as any[]).length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">暂无申请记录</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(myRequests as any[]).map((req: any) => (
                  <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {req.status === 'pending' ? (
                          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        ) : req.status === 'approved' ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`text-sm font-medium ${req.status === 'pending' ? 'text-amber-600' : req.status === 'approved' ? 'text-green-600' : 'text-gray-400'}`}>
                          {req.status === 'pending' ? '待审核' : req.status === 'approved' ? '已通过' : '已拒绝'}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {req.request_type === 'add' ? '新增企业' : req.request_type === 'update' ? '修改企业' : '删除企业'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(req.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 mb-1">{req.name}</div>
                    {req.tax_no && <div className="text-xs text-gray-400">税号：{req.tax_no}</div>}
                    {req.address && <div className="text-xs text-gray-400">地址：{req.address}</div>}
                    {req.phone && <div className="text-xs text-gray-400">电话：{req.phone}</div>}
                    {req.bank_name && <div className="text-xs text-gray-400">开户行：{req.bank_name}</div>}
                    {req.bank_account && <div className="text-xs text-gray-400">账号：{req.bank_account}</div>}
                    {req.remark && <div className="text-xs text-gray-400">备注：{req.remark}</div>}
                    {req.review_comment && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                        审核意见：{req.review_comment}
                        {req.reviewerName && <span className="ml-1 text-gray-400">（{req.reviewerName}）</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 开票分类面板 */}
      {expenseTypeCompany && (
        <ExpenseTypePanel
          ledgerId={ledgerId}
          company={expenseTypeCompany}
          onClose={() => setExpenseTypeCompany(null)}
        />
      )}

      {/* 开票记录面板 */}
      {invoiceCompany && (
        <InvoicePanel
          ledgerId={ledgerId}
          company={invoiceCompany}
          onClose={() => setInvoiceCompany(null)}
        />
      )}
    </div>
  );
}
