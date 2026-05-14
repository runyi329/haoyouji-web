import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Plus, Building2, Pencil, Trash2, Clock, CheckCircle, XCircle,
  ChevronRight, FileText, List, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCenterToast } from "@/components/ui/center-toast";
import { EXPENSE_CATEGORIES, getDefaultExpenseConfig } from "@/pages/AJCompanyManager";

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

// ========== 报销类型配置面板 ==========
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
    setConfig({ ...effectiveConfig, [catKey]: { ...effectiveConfig[catKey], enabled: !effectiveConfig[catKey].enabled } });
  };
  const toggleItem = (catKey: string, itemKey: string) => {
    setConfig({
      ...effectiveConfig,
      [catKey]: { ...effectiveConfig[catKey], items: { ...effectiveConfig[catKey].items, [itemKey]: !effectiveConfig[catKey].items[itemKey] } },
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
              const catState = effectiveConfig[cat.key] ?? { enabled: true, items: {} };
              return (
                <div key={cat.key} className="bg-gray-50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <span className="font-medium text-sm text-gray-700">{cat.label}</span>
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${catState.enabled ? 'bg-[#C0392B]' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${catState.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                  {catState.enabled && (
                    <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                      {cat.items.map((item) => {
                        const itemEnabled = catState.items[item.key] !== false;
                        return (
                          <button
                            key={item.key}
                            onClick={() => toggleItem(cat.key, item.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${itemEnabled ? 'bg-red-50 text-[#C0392B]' : 'bg-white text-gray-400 border border-gray-200'}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${itemEnabled ? 'bg-[#C0392B] border-[#C0392B]' : 'border-gray-300'}`}>
                              {itemEnabled && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
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
            className="w-full rounded-xl bg-[#C0392B] hover:bg-[#A93226] text-white"
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

// ========== 开票记录面板 ==========
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
  const { data: invoices, isLoading } = (trpc as any).ledger.ajOwnerGetCompanyInvoices.useQuery({ ledgerId, companyId: company.id, period });
  const totalAmount = (invoices as any[] | undefined)?.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0) || 0;
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
        {/* 周期切换 */}
        <div className="flex gap-2 px-4 py-3 border-b border-gray-50 flex-shrink-0">
          {(['month', 'quarter', 'year', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors ${period === p ? 'bg-[#C0392B] text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {p === 'month' ? '本月' : p === 'quarter' ? '本季' : p === 'year' ? '本年' : '全部'}
            </button>
          ))}
        </div>
        {/* 汇总 */}
        {!isLoading && invoices && (
          <div className="flex gap-4 px-4 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
            <div className="text-xs text-gray-500">共 <span className="font-bold text-[#C0392B]">{(invoices as any[]).length}</span> 笔</div>
            <div className="text-xs text-gray-500">合计 <span className="font-bold text-[#C0392B]">¥{totalAmount.toFixed(2)}</span></div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
          ) : !invoices || (invoices as any[]).length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">暂无开票记录</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(invoices as any[]).map((inv: any) => (
                <div key={inv.id} className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800">¥{Number(inv.amount || 0).toFixed(2)}</div>
                      {inv.description && <div className="text-xs text-gray-500 mt-0.5 truncate">{inv.description}</div>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{inv.date}</span>
                        {inv.creatorName && <span className="text-xs text-gray-400">· {inv.creatorName}</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${inv.status === 'approved' ? 'bg-green-50 text-green-600' : inv.status === 'rejected' ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-600'}`}>
                      {inv.status === 'approved' ? '已审核' : inv.status === 'rejected' ? '已拒绝' : '待审核'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== 企业申请表单 ==========
function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
  showTip,
}: {
  initial?: Partial<CompanyFormData>;
  onSubmit: (data: CompanyFormData) => void;
  onCancel: () => void;
  loading: boolean;
  submitLabel: string;
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
    <div className="space-y-3">
      {showTip && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-600">
          申请通过后，所有报销分类默认全部开启。您可在企业卡片下方「开票分类」中自行勾选或取消。
        </div>
      )}
      <Input value={form.name} onChange={set('name')} placeholder="企业名称（必填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.tax_no} onChange={set('tax_no')} placeholder="税号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.address} onChange={set('address')} placeholder="地址（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.phone} onChange={set('phone')} placeholder="电话（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.bank_name} onChange={set('bank_name')} placeholder="开户行（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.bank_account} onChange={set('bank_account')} placeholder="银行账号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.remark} onChange={set('remark')} placeholder="备注（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={onCancel}>取消</Button>
        <Button
          className="flex-1 rounded-xl bg-[#C0392B] hover:bg-[#A93226] text-white text-sm h-10"
          onClick={() => { if (!form.name.trim()) return; onSubmit(form); }}
          disabled={loading || !form.name.trim()}
        >
          {loading ? '提交中...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ========== 主面板（内嵌在LedgerDetail红色区域下方） ==========
export function AJOwnerPanel({ ledgerId }: { ledgerId: number }) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<'companies' | 'requests'>('companies');
  const [showAddForm, setShowAddForm] = useState(false);

  // 监听底部+按鈕触发的添加企业事件
  useEffect(() => {
    const handler = () => {
      setShowAddForm(true);
      setEditingCompany(null);
      setActiveTab('companies');
    };
    window.addEventListener('aj-owner-add-company', handler);
    return () => window.removeEventListener('aj-owner-add-company', handler);
  }, []);
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
    <div className="bg-gray-50 min-h-[300px]">
      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'companies' ? 'text-[#C0392B] border-b-2 border-[#C0392B]' : 'text-gray-500'}`}
          onClick={() => setActiveTab('companies')}
        >
          我的企业
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'requests' ? 'text-[#C0392B] border-b-2 border-[#C0392B]' : 'text-gray-500'}`}
          onClick={() => setActiveTab('requests')}
        >
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

      <div className="p-4 space-y-4 pb-24">
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
                <div className="text-gray-300 text-xs mt-1">点击下方「+」申请添加企业</div>
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
                          <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={() => setDeletingCompany(null)}>取消</Button>
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

      {/* 底部浮动「+」按钮已隐藏，改由顶部深蓝加号按钮触发添加企业 */}

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
