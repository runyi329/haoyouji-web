import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Building2, Pencil, Trash2, Clock, CheckCircle, XCircle,
  ChevronRight, List, X, Receipt, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCenterToast } from "@/components/ui/center-toast";
import { EXPENSE_CATEGORIES, getDefaultExpenseConfig } from "@/pages/AJCompanyManager";

// AJ 账本主色调（与账本首页一致）
const AJ_COLOR = '#1A2B4A';

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

// ========== 开票分类配置面板 ==========
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
  const { data: savedConfig, isLoading } = (trpc as any).ledger.ajGetCompanyExpenseTypes.useQuery({
    ledgerId,
    companyId: company.id,
  });
  const [config, setConfig] = useState<Record<string, { enabled: boolean; items: Record<string, boolean> }> | null>(null);
  const effectiveConfig = config ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
  const saveMutation = (trpc as any).ledger.ajSetCompanyExpenseTypes.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanyExpenseTypes.invalidate({ ledgerId, companyId: company.id });
      toast.success("开票分类配置已保存");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleCategory = (catKey: string) => {
    setConfig((prev) => {
      const base = prev ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
      return { ...base, [catKey]: { ...base[catKey], enabled: !base[catKey]?.enabled } };
    });
  };
  const toggleItem = (catKey: string, itemKey: string) => {
    setConfig((prev) => {
      const base = prev ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
      return {
        ...base,
        [catKey]: {
          ...base[catKey],
          items: { ...base[catKey]?.items, [itemKey]: !(base[catKey]?.items?.[itemKey] !== false) },
        },
      };
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">开票分类配置</div>
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
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${catState.enabled ? 'bg-[#1A2B4A]' : 'bg-gray-300'}`}>
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
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${itemEnabled ? 'bg-blue-50 text-[#1A2B4A]' : 'bg-white text-gray-400 border border-gray-200'}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${itemEnabled ? 'bg-[#1A2B4A] border-[#1A2B4A]' : 'border-gray-300'}`}>
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
            className="w-full rounded-xl text-white"
            style={{ backgroundColor: AJ_COLOR }}
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

// ========== 企业发票列表（内嵌展开，带时间筛选下拉框） ==========
function InvoiceListInline({
  ledgerId,
  companyId,
  period: externalPeriod,
}: {
  ledgerId: number;
  companyId: number;
  period?: 'all' | 'day' | 'week' | 'month' | 'year';
}) {
  // 如果外部传入 period，则不内部管理时间筛选
  const [internalPeriod, setInternalPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('month');
  const period = externalPeriod ?? internalPeriod;
  const { data: invoices, isLoading } = (trpc as any).ledger.ajOwnerGetCompanyInvoices.useQuery({ ledgerId, companyId, period });
  const periodLabels: Record<string, string> = { all: '全部', day: '今日', week: '本周', month: '本月', year: '本年' };

  return (
    <div>
      {/* 只有内部管理时才显示筛选栏 */}
      {!externalPeriod && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
          <div className="relative">
            <select
              value={internalPeriod}
              onChange={e => setInternalPeriod(e.target.value as any)}
              className="appearance-none text-xs font-medium pl-3 pr-7 py-1.5 rounded-full border border-gray-200 bg-white cursor-pointer outline-none focus:outline-none focus:ring-0"
              style={{ color: AJ_COLOR }}
            >
              <option value="day">今日</option>
              <option value="week">本周</option>
              <option value="month">本月</option>
              <option value="year">本年</option>
              <option value="all">全部</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: AJ_COLOR }} />
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : !invoices || (invoices as any[]).length === 0 ? (
        <div className="text-center py-8">
          <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <div className="text-gray-400 text-xs">{periodLabels[period]}暂无开票记录</div>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {(invoices as any[]).map((inv: any) => (
            <div key={inv.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800">¥{Number(inv.amount || 0).toFixed(2)}</div>
                  {inv.description && <div className="text-xs text-gray-500 mt-0.5 truncate">{inv.description}</div>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">{inv.recordDate || inv.date}</span>
                    {(inv.creatorNickname || inv.creatorName) && (
                      <span className="text-xs text-gray-400">· {inv.creatorNickname || inv.creatorName}</span>
                    )}
                    {inv.category && (
                      <span className="text-xs bg-blue-50 px-1.5 py-0.5 rounded" style={{ color: AJ_COLOR }}>{inv.category}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  inv.ajStatus === 'approved' ? 'bg-green-50 text-green-600' :
                  inv.ajStatus === 'rejected' ? 'bg-gray-100 text-gray-400' :
                  'bg-amber-50 text-amber-600'
                }`}>
                  {inv.ajStatus === 'approved' ? '已审核' : inv.ajStatus === 'rejected' ? '已拒绝' : '待审核'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
          className="flex-1 rounded-xl text-white text-sm h-10"
          style={{ backgroundColor: AJ_COLOR }}
          onClick={() => { if (!form.name.trim()) return; onSubmit(form); }}
          disabled={loading || !form.name.trim()}
        >
          {loading ? '提交中...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ========== 资方视角面板（独立组件） ==========
function FunderViewPanel({ ledgerId }: { ledgerId: number }) {
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const companies = (myCompanies as any[] | undefined) ?? [];

  // 企业加载完成后自动选中第一个
  useEffect(() => {
    if (!companiesLoading && companies.length > 0 && selectedCompanyId === null) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companiesLoading, companies.length]);

  // 统计数据（传 companyId 时后端直接返回单个对象）
  const { data: stats, isLoading: statsLoading } = (trpc as any).ledger.ajOwnerGetCompanyStats.useQuery(
    { ledgerId, companyId: selectedCompanyId!, period },
    { enabled: !!selectedCompanyId }
  );

  const periodLabels: Record<string, string> = { all: '全部', day: '今日', week: '本周', month: '本月', year: '本年' };

  return (
    <div>
      {/* 顶部深蓝色区域 */}
      <div style={{ backgroundColor: AJ_COLOR }} className="px-4 pt-3 pb-4">
        {/* 第一行：企业选择 + 时间筛选 */}
        <div className="flex items-center gap-2 mb-3">
          {/* 企业选择：1家不显示容器，超过1家显示与时间筛选一样的下拉框 */}
          {companiesLoading ? (
            <div className="text-white/60 text-xs flex-1">加载中...</div>
          ) : companies.length === 0 ? (
            <div className="text-white/60 text-xs flex-1">暂无授权企业</div>
          ) : companies.length === 1 ? (
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm font-semibold truncate">{companies[0].name}</span>
            </div>
          ) : (
            <div className="relative flex-1 min-w-0">
              <select
                value={selectedCompanyId ?? ''}
                onChange={e => setSelectedCompanyId(Number(e.target.value))}
                className="appearance-none w-full text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0 truncate"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
              >
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id} style={{ color: '#222', background: '#fff' }}>{c.name}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12"><path d="M6 8L2 4h8z"/></svg>
            </div>
          )}
          {/* 时间筛选（与劳方首页一致） */}
          <div className="relative flex-shrink-0">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="appearance-none text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
            >
              <option value="all" style={{ color: '#222' }}>全部</option>
              <option value="day" style={{ color: '#222' }}>今日</option>
              <option value="week" style={{ color: '#222' }}>本周</option>
              <option value="month" style={{ color: '#222' }}>本月</option>
              <option value="year" style={{ color: '#222' }}>本年</option>
            </select>
            <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12"><path d="M6 8L2 4h8z"/></svg>
          </div>
        </div>
        {/* 统计数据行：均匀分配 */}
        {selectedCompanyId && (
          <div className="flex items-center justify-around w-full">
            <div className="text-center">
              <div className="text-white/60 text-[10px] mb-0.5">{periodLabels[period]}累计金额</div>
              <div className="text-white text-xl font-bold leading-none">
                {statsLoading ? '--' : `¥${Number(stats?.totalAmount || 0).toFixed(2)}`}
              </div>
            </div>
            <div className="w-px h-8 bg-white/20 flex-shrink-0" />
            <div className="text-center">
              <div className="text-white/60 text-[10px] mb-0.5">{periodLabels[period]}开票条数</div>
              <div className="text-white text-xl font-bold leading-none">
                {statsLoading ? '--' : `${stats?.invoiceCount || 0}`}
                <span className="text-white/60 text-xs font-normal ml-1">笔</span>
              </div>
            </div>
            {stats?.salesmanCount > 0 && (
              <>
                <div className="w-px h-8 bg-white/20 flex-shrink-0" />
                <div className="text-center">
                  <div className="text-white/60 text-[10px] mb-0.5">业务员</div>
                  <div className="text-white text-xl font-bold leading-none">
                    {stats.salesmanCount}
                    <span className="text-white/60 text-xs font-normal ml-1">人</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {/* 白色发票列表区域 */}
      {selectedCompanyId && (
        <div className="bg-white">
          <InvoiceListInline ledgerId={ledgerId} companyId={selectedCompanyId} period={period} />
        </div>
      )}
    </div>
  );
}

// ========== 主面板 ==========
export function AJOwnerPanel({ ledgerId, isFunder = false }: { ledgerId: number; isFunder?: boolean }) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<'companies' | 'requests'>('companies');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  useEffect(() => {
    if (isFunder) return;
    const handler = () => {
      setShowAddForm(true);
      setEditingCompany(null);
      setActiveTab('companies');
    };
    window.addEventListener('aj-owner-add-company', handler);
    return () => window.removeEventListener('aj-owner-add-company', handler);
  }, [isFunder]);

  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<any | null>(null);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [expenseTypeCompany, setExpenseTypeCompany] = useState<{ id: number; name: string } | null>(null);

  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const { data: myRequests, isLoading: requestsLoading } = (trpc as any).ledger.ajOwnerGetMyRequests.useQuery({ ledgerId });

  const pendingCount = (myRequests as any[] | undefined)?.filter((r: any) => r.status === 'pending').length || 0;
  const companies = (myCompanies as any[] | undefined) ?? [];

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

  // 资方视角直接用独立组件
  if (isFunder) return <FunderViewPanel ledgerId={ledgerId} />;

  return (
    <div className="min-h-[300px]" style={{ background: '#F0F4FA' }}>
      {/* 顶部深蓝色区域：企业横向选择 */}
      <div className="px-4 pt-3 pb-4" style={{ backgroundColor: AJ_COLOR }}>
        {companiesLoading ? (
          <div className="text-white/60 text-xs py-2">加载中...</div>
        ) : companies.length === 0 ? (
          <div className="text-white/60 text-xs py-2">
            {isFunder ? '暂无授权企业' : '暂无企业，点击下方「+」添加'}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {companies.map((company: any) => {
              const isSelected = selectedCompanyId === company.id;
              return (
                <button
                  key={company.id}
                  onClick={() => setSelectedCompanyId(isSelected ? null : company.id)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                  style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                    border: isSelected ? '1.5px solid rgba(255,255,255,0.7)' : '1.5px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)' }}
                  >
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white text-xs font-medium max-w-[100px] truncate">
                    {company.name}
                  </span>
                  {isSelected && <ChevronDown className="w-3 h-3 text-white/70 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 选中企业后：发票列表区域 */}
      {selectedCompanyId !== null && (
        <div className="mx-4 mt-3 bg-white rounded-2xl overflow-hidden shadow-sm">
          {(() => {
            const company = companies.find((c: any) => c.id === selectedCompanyId);
            return company ? (
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: AJ_COLOR }}>
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">{company.name}</div>
                    {company.taxNo && <div className="text-xs text-gray-400">税号：{company.taxNo}</div>}
                  </div>
                </div>
                {!isFunder && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingCompany(company); setSelectedCompanyId(null); }}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => { setDeletingCompany(company); setDeleteRemark(''); setSelectedCompanyId(null); }}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            ) : null;
          })()}
          <button
            onClick={() => {
              const company = companies.find((c: any) => c.id === selectedCompanyId);
              if (company) setExpenseTypeCompany({ id: company.id, name: company.name });
            }}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <List className="w-4 h-4" style={{ color: AJ_COLOR }} />
              <span>开票分类</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </button>
          <InvoiceListInline ledgerId={ledgerId} companyId={selectedCompanyId} />
        </div>
      )}

      {/* Tab 切换（仅 admin 显示） */}
      {!isFunder && (
        <div className="flex border-b border-gray-200 bg-white mx-4 mt-3 rounded-t-2xl shadow-sm overflow-hidden">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'companies' ? 'border-b-2' : 'text-gray-400'}`}
            style={activeTab === 'companies' ? { color: AJ_COLOR, borderColor: AJ_COLOR } : {}}
            onClick={() => setActiveTab('companies')}
          >
            我的企业
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'requests' ? 'border-b-2' : 'text-gray-400'}`}
            style={activeTab === 'requests' ? { color: AJ_COLOR, borderColor: AJ_COLOR } : {}}
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
      )}

      {!isFunder && (
        <div className="mx-4 bg-white rounded-b-2xl shadow-sm p-4 pb-24 space-y-3">
          {activeTab === 'companies' && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                您名下的企业需经管理员审核后生效。添加、修改、删除均需提交申请。
              </div>
              {showAddForm && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
              {companiesLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
              ) : companies.length === 0 ? (
                <div className="text-center py-16">
                  <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <div className="text-gray-400 text-sm">暂无企业</div>
                  <div className="text-gray-300 text-xs mt-1">点击下方「+」申请添加企业</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {companies.map((company: any) => (
                    <div key={company.id} className="bg-gray-50 rounded-2xl overflow-hidden">
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
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: AJ_COLOR }}>
                              <Building2 className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-800 truncate">{company.name}</div>
                              {company.taxNo && <div className="text-xs text-gray-400 truncate">税号：{company.taxNo}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditingCompany(company)}
                              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
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
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
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
                    <div key={req.id} className="bg-gray-50 rounded-2xl p-4">
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
                          <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
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
                        <div className="mt-2 text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2">
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
      )}

      {expenseTypeCompany && (
        <ExpenseTypePanel
          ledgerId={ledgerId}
          company={expenseTypeCompany}
          onClose={() => setExpenseTypeCompany(null)}
        />
      )}
    </div>
  );
}
