import { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { OrderCardImageDownload } from '@/components/OrderCardImageDownload';
import {
  ChevronLeft, Trash2, ChevronDown, ChevronUp,
  Edit2, Check, X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000) + 1; // 首尾都算：同一天=1天，相差1天=2天
}

// 计算单段利息
function calcPeriodInterest(principal: number, annualRate: number, days: number): number {
  if (principal <= 0 || annualRate <= 0 || days <= 0) return 0;
  return principal * (annualRate / 100 / 365) * days;
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getInterestOperationLabel(actionType?: string): string {
  const labels: Record<string, string> = {
    period_added: '新增分段',
    period_updated: '编辑分段',
    period_deleted: '删除分段',
    manual_added: '手工调息',
    manual_updated: '编辑手工调息',
    manual_deleted: '删除手工调息',
    interest_paused: '暂停计息',
    interest_resumed: '恢复计息',
    legacy_manual: '历史手工调息',
  };
  return labels[actionType || ''] || '利息操作';
}

const EMPTY_PERIOD_FORM = { periodLabel: '', principal: '', annualRate: '', startDate: '', endDate: '' };

export default function InterestManagePage() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lid = parseInt(ledgerId || '0');
  // 仅37号账本首页专属快捷入口携带来源标记；其他进入方式保持原返回设置页逻辑。
  const returnToLedgerHome = lid === 37 && new URLSearchParams(window.location.search).get('from') === 'ledger-home';

  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const expandedCardRef = useRef<HTMLDivElement | null>(null);
  // 新增分段表单
  const [showAddPeriod, setShowAddPeriod] = useState<string | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_PERIOD_FORM);
  // 编辑分段
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editingManualId, setEditingManualId] = useState<number | null>(null);
  const [editManualForm, setEditManualForm] = useState({ amount: '', remark: '', isPlus: true });
  const [editForm, setEditForm] = useState(EMPTY_PERIOD_FORM);
  // 手工调息（Sheet 弹出层）
  const [manualSheetTag, setManualSheetTag] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ amount: '', remark: '', isPlus: true });
  // 日志
  const [showLogs, setShowLogs] = useState<string | null>(null);
  // 暂停确认弹窗
  const [confirmPauseTag, setConfirmPauseTag] = useState<string | null>(null);

  // 账本分类（标签）
  const { data: rawCategories = [] } = trpc.ledger.getCategories.useQuery(
    { ledgerId: lid, parentId: null },
    { enabled: lid > 0, staleTime: 30_000 }
  );
  const categories = useMemo(() => rawCategories.filter((c: any) => !c.isDefault), [rawCategories]);

  // 所有分段
  const { data: allPeriods = [], refetch: refetchPeriods } = trpc.ledger.getTagInterestPeriods.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0, staleTime: 30_000 }
  );

  // 标签利息的完整操作日志（分段、手工调息、暂停与恢复）
  const { data: allOperationLogs = [], refetch: refetchOperationLogs } = trpc.ledger.getTagInterestOperationLogs.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0, staleTime: 30_000 }
  );
  // 兼容尚未部署统一日志接口的热预览，以及上线前已有的手工调息历史。
  const { data: allManualLogs = [], refetch: refetchManualLogs } = trpc.ledger.getTagInterestManualLogs.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0, staleTime: 30_000 }
  );

  // 所有标签配置（用于读取 pause_date）
  const { data: allTagsConfig = {}, refetch: refetchTagsConfig } = trpc.ledger.getAllTagsConfigByLedger.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0, staleTime: 30_000 }
  );

  // 暂停 / 恢复 mutation
  const setTagPauseDateMutation = trpc.ledger.setTagPauseDate.useMutation({
    onSuccess: () => {
      refetchTagsConfig();
      refetchOperationLogs();
      refetchManualLogs();
      toast.success('已更新');
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePause = useCallback((tagName: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setTagPauseDateMutation.mutate({
      ledgerId: lid,
      tagName,
      pauseDate: today,
    });
    setConfirmPauseTag(null);
  }, [lid, setTagPauseDateMutation]);

  const handleResume = useCallback((tagName: string) => {
    setTagPauseDateMutation.mutate({
      ledgerId: lid,
      tagName,
      pauseDate: null,
    });
  }, [lid, setTagPauseDateMutation]);

  // 新增分段
  const addPeriodMutation = trpc.ledger.addTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('分段已添加');
      setShowAddPeriod(null);
      setAddForm(EMPTY_PERIOD_FORM);
      refetchPeriods();
      refetchOperationLogs();
      refetchManualLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 更新分段
  const updatePeriodMutation = trpc.ledger.updateTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('已保存');
      setEditingPeriodId(null);
      refetchPeriods();
      refetchOperationLogs();
      refetchManualLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 删除分段
  const utils = trpc.useUtils();
  const updateManualMutation = trpc.ledger.updateTagInterestPeriod.useMutation({
    onSuccess: async () => {
      await utils.ledger.getTagInterestPeriods.invalidate({ ledgerId: lid });
      setEditingManualId(null);
      toast.success('手工调息已更新');
      refetchOperationLogs();
      refetchManualLogs();
    },
    onError: (e) => toast.error(e.message),
  });


  const deletePeriodMutation = trpc.ledger.deleteTagInterestPeriod.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      refetchPeriods();
      refetchOperationLogs();
      refetchManualLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 新增手工调息
  const addManualMutation = trpc.ledger.addTagInterestManualLog.useMutation({
    onSuccess: () => {
      toast.success('手工调息已记录');
      setManualSheetTag(null);
      setManualForm({ amount: '', remark: '', isPlus: true });
      refetchPeriods();
      refetchOperationLogs();
      refetchManualLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 构建标签数据
  const tagData = useMemo(() => {
    const list = categories.map((cat: any) => {
      const tagName = cat.name;
      const tagConfig = (allTagsConfig as any)[tagName];
      const pauseDate: string | null = tagConfig?.pause_date ?? null;
      const periods = allPeriods.filter((p: any) => p.tag_name === tagName);
      const operationLogs = allOperationLogs.filter((log: any) => log.tag_name === tagName);
      const legacyManualLogs = allManualLogs
        .filter((log: any) => log.tag_name === tagName)
        .map((log: any) => ({
          ...log,
          action_type: 'legacy_manual',
          summary: `历史手工调息 ¥${fmt(Math.abs(parseFloat(log.amount) || 0))}${log.remark ? `；备注：${log.remark}` : ''}`,
        }));
      // 完整接口上线后由服务端去重并返回所有记录；热预览阶段回退到既有手工调息日志。
      const tagLogs = operationLogs.length > 0 ? operationLogs : legacyManualLogs;
      const manualAdj = periods
        .filter((period: any) => Number(period.is_manual) === 1)
        .reduce((sum: number, period: any) => sum + parseFloat(period.principal || '0'), 0);

      // 各段利息（is_manual=1的手工调息直接用principal作为利息金额）
      // 暂停时：end_date为空的分段用 pauseDate 作为结束日，利息冻结
      const periodDetails = periods.map((p: any) => {
        const principal = parseFloat(p.principal) || 0;
        const annualRate = parseFloat(p.annual_rate) || 0;
        const effectiveEndDate = (!p.end_date && pauseDate) ? pauseDate : (p.end_date || null);
        const days = calcPeriodDays(p.start_date, effectiveEndDate);
        const isManual = p.is_manual === 1 || p.is_manual === '1' || p.is_manual === true;
        const interest = isManual ? principal : calcPeriodInterest(principal, annualRate, days);
        const dailyInterest = (!isManual && !pauseDate && principal > 0 && annualRate > 0) ? principal * annualRate / 100 / 365 : 0;
        return { ...p, principal, annualRate, days, interest, dailyInterest, isManual };
      });
      const segmentCount = periodDetails.filter(p => !p.isManual).length;
      const autoInterest = periodDetails.filter(p => !p.isManual).reduce((sum, p) => sum + p.interest, 0);
      const manualTotal = periodDetails.filter(p => p.isManual).reduce((sum, p) => sum + p.interest, 0);
      const totalInterest = autoInterest + manualTotal;
      return { tagName, periods: periodDetails, segmentCount, tagLogs, manualAdj: manualTotal, autoInterest, totalInterest, pauseDate };
    });
    // 暂停的标签排到最后
    return [
      ...list.filter(t => !t.pauseDate),
      ...list.filter(t => !!t.pauseDate),
    ];
  }, [categories, allPeriods, allOperationLogs, allManualLogs, allTagsConfig]);

  const handleAddPeriod = (tagName: string) => {
    const principal = parseFloat(addForm.principal);
    const annualRate = parseFloat(addForm.annualRate);
    if (!principal || isNaN(principal)) return toast.error('请输入计息基数');
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
    if (!principal || isNaN(principal)) return toast.error('请输入计息基数');
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
          onClick={() => setLocation(returnToLedgerHome ? `/ledger/${lid}` : `/ledger/${lid}/settings`)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <div className="text-base font-bold text-gray-900">利息管理</div>
          <div className="text-xs text-gray-400">按标签·分段设置计息基数与年化利率</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {tagData.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无标签数据</div>
        ) : (
          tagData.map((tag) => (
            <div
              key={tag.tagName}
              ref={expandedTag === tag.tagName ? expandedCardRef : null}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              style={tag.pauseDate ? { borderColor: '#bfdbfe' } : undefined}
            >
              {/* 数字概览：默认仅展示标签与当前结算数字，点击数字查看全部明细 */}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${tag.pauseDate ? 'bg-blue-400' : 'bg-slate-400'}`} />
                  <span className="text-sm font-bold text-gray-700">{tag.tagName}</span>
                  <span className="text-xs tabular-nums text-gray-400">{tag.segmentCount} 段</span>
                  {tag.pauseDate && (
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 bg-blue-50">
                      已暂停 {tag.pauseDate.slice(5)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {expandedTag === tag.tagName && (
                    <OrderCardImageDownload
                      targetRef={expandedCardRef}
                      orderNo={`利息-${tag.tagName}`}
                      color="#94A3B8"
                      outerPadding={0}
                      captureFullContent
                      variant="bare"
                      watermarkMode="time-only"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedTag(expandedTag === tag.tagName ? null : tag.tagName)}
                    aria-label={`${expandedTag === tag.tagName ? '收起' : '查看'}${tag.tagName}的利息明细`}
                    className="flex min-h-10 items-center gap-1.5 rounded-md px-1 text-right transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    {expandedTag === tag.tagName ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <>
                        <span className="text-[11px] text-gray-500">
                          {tag.totalInterest > 0 ? '欠息' : tag.totalInterest < 0 ? '已预缴' : '已结清'}
                        </span>
                        <span className={`text-base font-bold tabular-nums ${tag.totalInterest > 0 ? 'text-red-500' : tag.totalInterest < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          ¥ {tag.totalInterest === 0 ? '0.00' : fmt(Math.abs(tag.totalInterest))}
                        </span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {expandedTag === tag.tagName && (
                <div className="border-t border-gray-50">

                  {/* 当前结算：先说明当前状态，再解释计息构成 */}
                  <div className="px-4 pb-2 pt-2.5">
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 text-[11px]">
                        <span className="font-semibold tracking-wide text-gray-700">当前结算</span>
                        <span className="text-gray-400">{tag.pauseDate ? `截至 ${tag.pauseDate.slice(5)}（已暂停）` : '截至今日'}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2.5">
                        {tag.totalInterest > 0 ? (
                          <span className="text-sm font-semibold text-gray-700">欠息</span>
                        ) : tag.totalInterest < 0 ? (
                          <span className="text-sm font-semibold text-gray-700">已预缴</span>
                        ) : (
                          <span className="text-sm font-semibold text-gray-700">已结清</span>
                        )}
                        <span className={`text-lg font-bold tabular-nums ${tag.totalInterest > 0 ? 'text-red-500' : tag.totalInterest < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          ¥ {tag.totalInterest === 0 ? '0.00' : fmt(Math.abs(tag.totalInterest))}
                        </span>
                      </div>
                      <div className="space-y-1 border-t border-gray-200 px-3 py-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">自动计息</span>
                          <span className={`font-medium tabular-nums ${tag.autoInterest >= 0 ? 'text-red-500' : 'text-green-600'}`}>¥ {fmt(tag.autoInterest)}</span>
                        </div>
                        {tag.manualAdj !== 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">已计入手工调息</span>
                            <span className={`font-medium tabular-nums ${tag.manualAdj > 0 ? 'text-red-500' : 'text-green-600'}`}>
                              {tag.manualAdj > 0 ? '+' : ''}¥ {fmt(tag.manualAdj)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 计息明细：说明当前结算由哪些分段和调息记录构成 */}
                  <div className="flex items-center gap-2 px-4 pb-1.5 pt-0.5">
                    <span className="shrink-0 text-[11px] font-semibold tracking-wide text-gray-700">计息明细</span>
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{tag.segmentCount} 段</span>
                  </div>
                  {tag.periods.length === 0 ? (
                    <div className="px-4 py-4 text-center text-xs text-gray-400">暂无分段，点击下方「添加分段」</div>
                  ) : (
                    <div className="mx-4 overflow-hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-200">
                      {tag.periods.map((period: any, idx: number) => (
                        <div key={period.id} className="px-3 py-2">
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
                                {period.isManual ? (
                                  /* 手工调息展示/编辑 */
                                  editingManualId === period.id ? (
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => setEditManualForm(f => ({ ...f, isPlus: true }))}
                                          className={`text-xs px-2 py-0.5 rounded-full border ${editManualForm.isPlus ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-400 border-gray-200'}`}
                                        >计入应收</button>
                                        <button
                                          onClick={() => setEditManualForm(f => ({ ...f, isPlus: false }))}
                                          className={`text-xs px-2 py-0.5 rounded-full border ${!editManualForm.isPlus ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-400 border-gray-200'}`}
                                        >计入已付</button>
                                      </div>
                                      <input
                                        type="number"
                                        placeholder="金额"
                                        value={editManualForm.amount}
                                        onChange={e => setEditManualForm(f => ({ ...f, amount: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                                      />
                                      <input
                                        type="text"
                                        placeholder="备注（选填）"
                                        value={editManualForm.remark}
                                        onChange={e => setEditManualForm(f => ({ ...f, remark: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => {
                                            const amt = parseFloat(editManualForm.amount);
                                            if (!amt || isNaN(amt)) return toast.error('请输入金额');
                                            const finalAmt = editManualForm.isPlus ? Math.abs(amt) : -Math.abs(amt);
                                            updateManualMutation.mutate({
                                              ledgerId: lid,
                                              periodId: period.id,
                                              principal: finalAmt,
                                              annualRate: 0,
                                              startDate: period.start_date || new Date().toISOString().slice(0, 10),
                                              endDate: period.start_date || new Date().toISOString().slice(0, 10),
                                              periodLabel: '手工调息',
                                              remark: editManualForm.remark || undefined,
                                            });
                                          }}
                                          className="flex-1 bg-gray-800 text-white text-xs py-1.5 rounded-lg"
                                        >保存</button>
                                        <button
                                          onClick={() => setEditingManualId(null)}
                                          className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded-lg"
                                        >取消</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                                          手工调息
                                        </span>
                                        <span className="flex shrink-0 items-baseline gap-1.5">
                                          <span className="font-medium text-gray-600">调息金额</span>
                                          <span className={`text-sm font-bold tabular-nums ${period.principal >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                            {period.principal >= 0 ? '+' : ''}¥ {fmt(period.principal)}
                                          </span>
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-gray-400">
                                        <span className="tabular-nums">{period.created_at?.slice(0, 10)}</span>
                                        <span>{period.principal >= 0 ? '计入应收' : '计入已付'}</span>
                                        {period.manual_remark && (
                                          <span className="min-w-0 break-words">备注：{period.manual_remark}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  /* 普通分段展示：结果数字优先，计息参数作为无框次级说明 */
                                  <div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                                        {period.period_label || `第 ${idx + 1} 段`}
                                      </span>
                                      <span className="flex shrink-0 items-baseline gap-1.5">
                                        <span className="font-medium text-gray-600">本段利息</span>
                                        <span className={`text-sm font-bold tabular-nums ${period.interest >= 0 ? 'text-red-500' : 'text-green-600'}`}>¥ {fmt(period.interest)}</span>
                                      </span>
                                    </div>
                                    <div className="mt-1 text-xs leading-4 text-gray-400 tabular-nums">
                                      {period.start_date} → {period.end_date || '至今'} · 共 {period.days} 天
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] leading-4 text-gray-400">
                                      <span className="min-w-0 truncate whitespace-nowrap">计息基数 <span className="font-medium tabular-nums text-gray-700">¥ {fmt(period.principal)}</span></span>
                                      <span className="shrink-0 whitespace-nowrap">年化 <span className="font-medium tabular-nums text-gray-700">{period.annualRate}%</span></span>
                                      <span className="shrink-0 whitespace-nowrap">日利息 <span className="font-medium tabular-nums text-gray-700">¥ {fmt(period.dailyInterest)}</span></span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {isEditMode && editingManualId !== period.id && (
                              <div className="flex gap-1 ml-2 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    if (period.isManual) {
                                      setEditingManualId(period.id);
                                      setEditManualForm({
                                        amount: String(Math.abs(period.principal)),
                                        remark: period.manual_remark || '',
                                        isPlus: period.principal >= 0,
                                      });
                                    } else {
                                      setEditingPeriodId(period.id);
                                      setEditForm({
                                        periodLabel: period.period_label || '',
                                        principal: String(period.principal),
                                        annualRate: String(period.annualRate),
                                        startDate: period.start_date || '',
                                        endDate: period.end_date || '',
                                      });
                                    }
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(period.isManual ? '确认删除此手工调息记录？' : '确认删除此分段？')) {
                                      deletePeriodMutation.mutate({ ledgerId: lid, periodId: period.id });
                                    }
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}


                  {/* 管理：与结算和计息明细分区，导出图片时不显示 */}
                  <div data-card-export-hide="true" className="mx-4 mt-3 flex items-center justify-between border-t border-gray-200 pb-1.5 pt-2.5">
                    <span className="text-[11px] font-semibold tracking-wide text-gray-700">管理</span>
                    {isEditMode && (
                      <span className="text-[11px] text-gray-400">编辑中 · 可修改或删除明细</span>
                    )}
                  </div>

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
                    <div data-card-export-hide="true" className="mx-4 mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <div className="grid grid-cols-2 divide-x divide-gray-200 bg-gray-50">
                        <button
                          onClick={() => { setShowAddPeriod(tag.tagName); setAddForm(EMPTY_PERIOD_FORM); }}
                          className="min-w-0 py-2.5 text-center text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100"
                        >
                          添加分段
                        </button>
                        <button
                          onClick={() => {
                            setManualSheetTag(tag.tagName);
                            setManualForm({ amount: '', remark: '', isPlus: true });
                          }}
                          className="min-w-0 py-2.5 text-center text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100"
                        >
                          手工调息
                        </button>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-gray-200">
                        <button
                          onClick={() => setShowLogs(showLogs === tag.tagName ? null : tag.tagName)}
                          className={`min-w-0 py-2.5 text-center text-[11px] font-medium transition-colors hover:bg-gray-50 active:bg-gray-100 ${showLogs === tag.tagName ? 'bg-gray-50 text-gray-900' : 'text-gray-600'}`}
                        >
                          操作日志 <span className="text-gray-400">{tag.tagLogs.length}</span>
                        </button>
                        {tag.pauseDate ? (
                          <button
                            onClick={() => handleResume(tag.tagName)}
                            className="min-w-0 py-2.5 text-center text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100"
                          >
                            恢复
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmPauseTag(tag.tagName)}
                            className="min-w-0 py-2.5 text-center text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100"
                          >
                            暂停
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isEditMode) {
                              setEditingPeriodId(null);
                              setEditingManualId(null);
                            }
                            setIsEditMode(!isEditMode);
                          }}
                          className={`min-w-0 py-2.5 text-center text-[11px] font-medium transition-colors hover:bg-gray-50 active:bg-gray-100 ${isEditMode ? 'bg-gray-50 text-gray-900' : 'text-gray-600'}`}
                        >
                          {isEditMode ? '完成' : '编辑'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 手工调息：已移至底部 Sheet 弹出层 */}

                  {/* 完整操作日志：日志本身不可删除，业务记录删除后仍保留对应追溯条目。 */}
                  {showLogs === tag.tagName && (
                    <div className="mx-4 mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
                        <span className="text-[11px] font-semibold tracking-wide text-gray-700">操作日志</span>
                        <span className="text-[11px] tabular-nums text-gray-400">{tag.tagLogs.length} 条</span>
                      </div>
                      {tag.tagLogs.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-gray-400">暂无利息操作日志</div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {tag.tagLogs.map((log: any) => (
                            <div key={`${log.action_type || 'legacy'}-${log.id}-${log.created_at}`} className="px-3 py-2">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
                                  {getInterestOperationLabel(log.action_type)}
                                </span>
                                <span className="min-w-0 break-words text-xs leading-5 text-gray-700">{log.summary}</span>
                              </div>
                              <div className="mt-0.5 pl-0 text-[11px] tabular-nums text-gray-400">
                                {log.user_nickname || log.username || '管理员'} · {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </div>
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

      {/* 手工调息 Sheet 弹出层 */}
      <Sheet open={manualSheetTag !== null} onOpenChange={(open) => { if (!open) setManualSheetTag(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base font-bold text-gray-900">
              手工调息 · {manualSheetTag}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <p className="text-xs leading-5 text-gray-500">计入应收会增加欠息；计入已付用于记录已收到的利息并冲减欠息。</p>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 divide-x divide-gray-200">
              <button
                onClick={() => setManualForm(f => ({ ...f, isPlus: true }))}
                className={`py-2.5 text-sm font-medium transition-colors ${manualForm.isPlus ? 'bg-red-50 text-red-700' : 'bg-white text-gray-500'}`}
              >
                计入应收
              </button>
              <button
                onClick={() => setManualForm(f => ({ ...f, isPlus: false }))}
                className={`py-2.5 text-sm font-medium transition-colors ${!manualForm.isPlus ? 'bg-green-50 text-green-700' : 'bg-white text-gray-500'}`}
              >
                计入已付
              </button>
            </div>
            <input
              type="number"
              value={manualForm.amount}
              onChange={(e) => setManualForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="金额（元）"
              className="w-full px-3 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
              autoFocus
            />
            <input
              type="text"
              value={manualForm.remark}
              onChange={(e) => setManualForm(f => ({ ...f, remark: e.target.value }))}
              placeholder="备注说明（选填）"
              className="w-full px-3 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
            />
            <button
              onClick={() => manualSheetTag && handleAddManual(manualSheetTag)}
              disabled={addManualMutation.isPending || !manualForm.amount}
              className="w-full py-3 rounded-xl bg-gray-800 text-sm font-semibold text-white disabled:opacity-50"
            >
              {addManualMutation.isPending ? '提交中...' : `确认手工调息${manualForm.amount ? ` ¥${manualForm.amount}` : ''}`}
            </button>
          </div>
        </SheetContent>
      </Sheet>
      {/* 确认暂停弹窗 */}
      {confirmPauseTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <div className="text-base font-bold mb-2">确认暂停？</div>
            <div className="text-sm text-gray-500 mb-4">暂停后利息将从今天起冻结，不再滚动计算。</div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPauseTag(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm"
              >
                取消
              </button>
              <button
                onClick={() => handlePause(confirmPauseTag)}
                className="flex-1 py-2 rounded-xl bg-gray-500 text-white text-sm font-semibold"
              >
                确认暂停
              </button>
            </div>
          </div>
        </div>
      )}
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
          <label className="text-xs text-gray-400 mb-0.5 block">计息基数（元）</label>
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
