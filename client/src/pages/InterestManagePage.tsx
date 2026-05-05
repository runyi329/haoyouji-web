import { useState, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import {
  ChevronLeft, Plus, Minus, Trash2, ChevronDown, ChevronUp,
  TrendingUp, FileText, Edit2, Check, X, PlusCircle
} from 'lucide-react';
import { toast } from 'sonner';

// 计算某一分段的天数（北京时间，过0点算一天）
function calcPeriodDays(startDateStr: string, endDateStr?: string | null): number {
  if (!startDateStr) return 0;
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();

  let endMs: number;
  if (endDateStr) {
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    endMs = new Date(ey, em - 1, ed, 0, 0, 0, 0).getTime();
  } else {
    const now = new Date();
    endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  const diff = endMs - startMs;
  if (diff <= 0) return 0;
  return Math.floor(diff / 86400000) + 1; // 当天算1天
}

// 计算单段利息
function calcPeriodInterest(principal: number, annualRate: number, days: number): number {
  if (principal <= 0 || annualRate <= 0 || days <= 0) return 0;
  return principal * (annualRate / 100 / 365) * days;
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_PERIOD_FORM = { periodLabel: '', principal: '', annualRate: '', startDate: '', endDate: '' };

export default function InterestManagePage() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lid = parseInt(ledgerId || '0');

  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  // 新增分段表单
  const [showAddPeriod, setShowAddPeriod] = useState<string | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_PERIOD_FORM);
  // 编辑分段
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_PERIOD_FORM);
  // 手工调息
  const [showManualForm, setShowManualForm] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ amount: '', remark: '', isPlus: true });
  // 日志
  const [showLogs, setShowLogs] = useState<string | null>(null);

  // 账本分类（标签）
  const { data: rawCategories = [] } = trpc.ledger.getCategories.useQuery(
    { ledgerId: lid, parentId: null },
    { enabled: lid > 0 }
  );
  const categories = useMemo(() => rawCategories.filter((c: any) => !c.isDefault), [rawCategories]);

  // 所有分段
  const { data: allPeriods = [], refetch: refetchPeriods } = trpc.ledger.getTagInterestPeriods.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 手工调息日志
  const { data: allLogs = [], refetch: refetchLogs } = trpc.ledger.getTagInterestManualLogs.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 新增分段
  const addPeriodMutation = trpc.ledger.addTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('分段已添加');
      setShowAddPeriod(null);
      setAddForm(EMPTY_PERIOD_FORM);
      refetchPeriods();
    },
    onError: (e) => toast.error(e.message),
  });

  // 更新分段
  const updatePeriodMutation = trpc.ledger.updateTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('已保存');
      setEditingPeriodId(null);
      refetchPeriods();
    },
    onError: (e) => toast.error(e.message),
  });

  // 删除分段
  const deletePeriodMutation = trpc.ledger.deleteTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      refetchPeriods();
    },
    onError: (e) => toast.error(e.message),
  });

  // 新增手工调息
  const addManualMutation = trpc.ledger.addTagInterestManualLog.useMutation({
    onSuccess: () => {
      toast.success('手工调息已记录');
      setShowManualForm(null);
      setManualForm({ amount: '', remark: '', isPlus: true });
      refetchLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 删除手工调息
  const deleteManualMutation = trpc.ledger.deleteTagInterestManualLog.useMutation({
    onSuccess: () => { toast.success('已删除'); refetchLogs(); },
    onError: (e) => toast.error(e.message),
  });

  // 构建标签数据
  const tagData = useMemo(() => {
    return categories.map((cat: any) => {
      const tagName = cat.name;
      const periods = allPeriods.filter((p: any) => p.tag_name === tagName);
      const tagLogs = allLogs.filter((l: any) => l.tag_name === tagName);
      const manualAdj = tagLogs.reduce((sum: number, l: any) => sum + parseFloat(l.amount || '0'), 0);

      // 各段利息
      const periodDetails = periods.map((p: any) => {
        const principal = parseFloat(p.principal) || 0;
        const annualRate = parseFloat(p.annual_rate) || 0;
        const days = calcPeriodDays(p.start_date, p.end_date);
        const interest = calcPeriodInterest(principal, annualRate, days);
        const dailyInterest = principal > 0 && annualRate > 0 ? principal * annualRate / 100 / 365 : 0;
        return { ...p, principal, annualRate, days, interest, dailyInterest };
      });

      const autoInterest = periodDetails.reduce((sum, p) => sum + p.interest, 0);
      const totalInterest = autoInterest + manualAdj;

      return { tagName, periods: periodDetails, tagLogs, manualAdj, autoInterest, totalInterest };
    });
  }, [categories, allPeriods, allLogs]);

  const handleAddPeriod = (tagName: string) => {
    const principal = parseFloat(addForm.principal);
    const annualRate = parseFloat(addForm.annualRate);
    if (!principal || isNaN(principal)) return toast.error('请输入本金');
    if (!annualRate || isNaN(annualRate)) return toast.error('请输入年化利率');
    if (!addForm.startDate) return toast.error('请选择起息日期');
    addPeriodMutation.mutate({
      ledgerId: lid, tagName,
      periodLabel: addForm.periodLabel || undefined,
      principal, annualRate,
      startDate: addForm.startDate,
      endDate: addForm.endDate || undefined,
    });
  };

  const handleUpdatePeriod = (periodId: number) => {
    const principal = parseFloat(editForm.principal);
    const annualRate = parseFloat(editForm.annualRate);
    if (!principal || isNaN(principal)) return toast.error('请输入本金');
    if (!annualRate || isNaN(annualRate)) return toast.error('请输入年化利率');
    if (!editForm.startDate) return toast.error('请选择起息日期');
    updatePeriodMutation.mutate({
      ledgerId: lid, periodId,
      periodLabel: editForm.periodLabel || undefined,
      principal, annualRate,
      startDate: editForm.startDate,
      endDate: editForm.endDate || undefined,
    });
  };

  const handleAddManual = (tagName: string) => {
    const amt = parseFloat(manualForm.amount);
    if (!amt || isNaN(amt)) return toast.error('请输入有效金额');
    addManualMutation.mutate({
      ledgerId: lid, tagName,
      amount: manualForm.isPlus ? Math.abs(amt) : -Math.abs(amt),
      remark: manualForm.remark || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation(`/ledger/${lid}/settings`)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <div className="text-base font-bold text-gray-900">利息管理</div>
          <div className="text-xs text-gray-400">按标签·分段设置本金与年化利率</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {tagData.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无标签数据</div>
        ) : (
          tagData.map((tag) => (
            <div key={tag.tagName} className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {/* 标签标题行 */}
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedTag(expandedTag === tag.tagName ? null : tag.tagName)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-bold text-gray-900">{tag.tagName}</span>
                  <span className="text-xs text-gray-400">{tag.periods.length} 段</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-600">¥ {fmt(tag.totalInterest)}</div>
                    <div className="text-xs text-gray-400">累计利息</div>
                  </div>
                  {expandedTag === tag.tagName
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {expandedTag === tag.tagName && (
                <div className="border-t border-gray-50">

                  {/* 分段列表 */}
                  {tag.periods.length === 0 ? (
                    <div className="px-4 py-4 text-center text-xs text-gray-400">暂无分段，点击下方「添加分段」</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {tag.periods.map((period: any, idx: number) => (
                        <div key={period.id} className="px-4 py-3">
                          {editingPeriodId === period.id ? (
                            /* 编辑模式 */
                            <div className="space-y-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-blue-600">编辑第 {idx + 1} 段</span>
                                <div className="flex gap-2">
                                  <button onClick={() => handleUpdatePeriod(period.id)} className="w-7 h-7 flex items-center justify-center rounded-full bg-green-100 text-green-600">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingPeriodId(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <PeriodForm form={editForm} setForm={setEditForm} />
                            </div>
                          ) : (
                            /* 展示模式 */
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-gray-700">
                                    {period.period_label || `第 ${idx + 1} 段`}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {period.start_date} → {period.end_date || '至今'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-xs">
                                  <div>
                                    <span className="text-gray-400">本金 </span>
                                    <span className="font-medium text-gray-700">¥{fmt(period.principal)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">年化 </span>
                                    <span className="font-medium text-blue-600">{period.annualRate}%</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">天数 </span>
                                    <span className="font-medium text-gray-700">{period.days}天</span>
                                  </div>
                                </div>
                                <div className="mt-1 text-xs">
                                  <span className="text-gray-400">日利息 </span>
                                  <span className="text-orange-500 font-medium">¥{fmt(period.dailyInterest)}</span>
                                  <span className="mx-2 text-gray-300">|</span>
                                  <span className="text-gray-400">本段利息 </span>
                                  <span className="text-green-600 font-semibold">¥{fmt(period.interest)}</span>
                                </div>
                              </div>
                              <div className="flex gap-1 ml-2 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingPeriodId(period.id);
                                    setEditForm({
                                      periodLabel: period.period_label || '',
                                      principal: String(period.principal),
                                      annualRate: String(period.annualRate),
                                      startDate: period.start_date || '',
                                      endDate: period.end_date || '',
                                    });
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('确认删除此分段？')) {
                                      deletePeriodMutation.mutate({ ledgerId: lid, periodId: period.id });
                                    }
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 利息汇总 */}
                  {tag.periods.length > 0 && (
                    <div className="mx-4 mb-3 px-3 py-2 bg-green-50 rounded-xl">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">自动计息合计</span>
                        <span className="text-green-600 font-semibold">¥ {fmt(tag.autoInterest)}</span>
                      </div>
                      {tag.manualAdj !== 0 && (
                        <div className="flex justify-between text-xs mt-0.5">
                          <span className="text-gray-500">手工调整</span>
                          <span className={`font-semibold ${tag.manualAdj > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {tag.manualAdj > 0 ? '+' : ''}{fmt(tag.manualAdj)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs border-t border-green-100 mt-1.5 pt-1.5">
                        <span className="font-semibold text-gray-700">累计利息合计</span>
                        <span className="text-green-600 font-bold text-sm">¥ {fmt(tag.totalInterest)}</span>
                      </div>
                    </div>
                  )}

                  {/* 添加分段表单 */}
                  {showAddPeriod === tag.tagName ? (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-600">添加新分段</span>
                        <button onClick={() => setShowAddPeriod(null)} className="text-xs text-gray-400">取消</button>
                      </div>
                      <PeriodForm form={addForm} setForm={setAddForm} />
                      <button
                        onClick={() => handleAddPeriod(tag.tagName)}
                        disabled={addPeriodMutation.isPending}
                        className="w-full mt-3 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                      >
                        {addPeriodMutation.isPending ? '添加中...' : '确认添加'}
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 pb-3 border-t border-gray-100 pt-3 flex gap-2">
                      <button
                        onClick={() => { setShowAddPeriod(tag.tagName); setAddForm(EMPTY_PERIOD_FORM); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-medium"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        添加分段
                      </button>
                      <button
                        onClick={() => {
                          setShowManualForm(showManualForm === tag.tagName ? null : tag.tagName);
                          setManualForm({ amount: '', remark: '', isPlus: true });
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-medium"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        手工调息
                      </button>
                      <button
                        onClick={() => setShowLogs(showLogs === tag.tagName ? null : tag.tagName)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        日志({tag.tagLogs.length})
                      </button>
                    </div>
                  )}

                  {/* 手工调息表单 */}
                  {showManualForm === tag.tagName && (
                    <div className="px-4 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
                      <div className="text-xs font-semibold text-gray-600">手工调息</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setManualForm(f => ({ ...f, isPlus: true }))}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-colors ${manualForm.isPlus ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200'}`}
                        >
                          <Plus className="w-4 h-4" /> 加息
                        </button>
                        <button
                          onClick={() => setManualForm(f => ({ ...f, isPlus: false }))}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-colors ${!manualForm.isPlus ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-500 border-gray-200'}`}
                        >
                          <Minus className="w-4 h-4" /> 减息
                        </button>
                      </div>
                      <input
                        type="number"
                        value={manualForm.amount}
                        onChange={(e) => setManualForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="金额（元）"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                      />
                      <input
                        type="text"
                        value={manualForm.remark}
                        onChange={(e) => setManualForm(f => ({ ...f, remark: e.target.value }))}
                        placeholder="备注说明"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                      />
                      <button
                        onClick={() => handleAddManual(tag.tagName)}
                        disabled={addManualMutation.isPending || !manualForm.amount}
                        className={`w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${manualForm.isPlus ? 'bg-green-500' : 'bg-red-500'}`}
                      >
                        {addManualMutation.isPending ? '提交中...' : `确认${manualForm.isPlus ? '加息' : '减息'}${manualForm.amount ? ` ¥${manualForm.amount}` : ''}`}
                      </button>
                    </div>
                  )}

                  {/* 手工调息日志 */}
                  {showLogs === tag.tagName && (
                    <div className="border-t border-gray-100">
                      {tag.tagLogs.length === 0 ? (
                        <div className="px-4 py-4 text-center text-xs text-gray-400">暂无手工调息记录</div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {tag.tagLogs.map((log: any) => (
                            <div key={log.id} className="px-4 py-3 flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-bold ${parseFloat(log.amount) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {parseFloat(log.amount) > 0 ? '+' : ''}{fmt(parseFloat(log.amount))}
                                  </span>
                                  {log.remark && (
                                    <span className="text-xs text-gray-500 truncate max-w-[120px]">{log.remark}</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {log.user_nickname || log.username || '管理员'} · {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (confirm('确认删除此调息记录？')) {
                                    deleteManualMutation.mutate({ ledgerId: lid, logId: log.id });
                                  }
                                }}
                                className="ml-2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 分段表单组件（新增/编辑共用）
function PeriodForm({ form, setForm }: {
  form: { periodLabel: string; principal: string; annualRate: string; startDate: string; endDate: string };
  setForm: (f: any) => void;
}) {
  const previewDays = form.startDate ? calcPeriodDays(form.startDate, form.endDate || undefined) : 0;
  const previewInterest = form.principal && form.annualRate && previewDays > 0
    ? calcPeriodInterest(parseFloat(form.principal) || 0, parseFloat(form.annualRate) || 0, previewDays)
    : null;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={form.periodLabel}
        onChange={(e) => setForm((f: any) => ({ ...f, periodLabel: e.target.value }))}
        placeholder="阶段名称（选填，如：第一阶段）"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-0.5 block">本金（元）</label>
          <input
            type="number"
            value={form.principal}
            onChange={(e) => setForm((f: any) => ({ ...f, principal: e.target.value }))}
            placeholder="如：1000000"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-0.5 block">年化利率（%）</label>
          <input
            type="number"
            value={form.annualRate}
            onChange={(e) => setForm((f: any) => ({ ...f, annualRate: e.target.value }))}
            placeholder="如：12"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-0.5 block">起息日期</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f: any) => ({ ...f, startDate: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-0.5 block">结束日期（空=至今）</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f: any) => ({ ...f, endDate: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
          />
        </div>
      </div>
      {/* 实时预览 */}
      {form.principal && form.annualRate && form.startDate && (
        <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700 space-y-0.5">
          <div>日利率：{(parseFloat(form.annualRate) / 365).toFixed(6)}%</div>
          <div>日利息：¥{fmt((parseFloat(form.principal) || 0) * (parseFloat(form.annualRate) || 0) / 100 / 365)}</div>
          <div>计息天数：{previewDays} 天</div>
          {previewInterest !== null && (
            <div className="font-semibold">本段利息预计：¥{fmt(previewInterest)}</div>
          )}
        </div>
      )}
    </div>
  );
}
