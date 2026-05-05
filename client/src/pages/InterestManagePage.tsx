import { useState, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, Settings, Plus, Minus, Trash2, ChevronDown, ChevronUp, TrendingUp, Calendar, DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';

// 计算已过天数（北京时间，过0点算一天）
function calcDays(startDateStr: string): number {
  if (!startDateStr) return 0;
  // 解析起息日期（按北京时间0点）
  const [y, m, d] = startDateStr.split('-').map(Number);
  const startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  // 今天北京时间0点
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const diff = todayMs - startMs;
  if (diff <= 0) return 0;
  return Math.floor(diff / 86400000) + 1; // 当天算1天
}

// 计算利息：本金 × 年化利率/365 × 天数 + 手工调整
function calcInterest(principal: number, annualRate: number, days: number, manualAdj: number): number {
  const dailyRate = annualRate / 100 / 365;
  return principal * dailyRate * days + manualAdj;
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InterestManagePage() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lid = parseInt(ledgerId || '0');

  // 当前展开的标签
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  // 编辑模式
  const [editingTag, setEditingTag] = useState<string | null>(null);
  // 编辑表单
  const [editForm, setEditForm] = useState({ principal: '', annualRate: '', startDate: '' });
  // 手工调息表单
  const [manualForm, setManualForm] = useState({ amount: '', remark: '', isPlus: true });
  const [showManualForm, setShowManualForm] = useState<string | null>(null);
  // 日志展开
  const [showLogs, setShowLogs] = useState<string | null>(null);

  // 获取账本分类（标签列表）
  const { data: rawCategories = [] } = trpc.ledger.getCategories.useQuery(
    { ledgerId: lid, parentId: null },
    { enabled: lid > 0 }
  );
  const categories = useMemo(() => rawCategories.filter((c: any) => !c.isDefault), [rawCategories]);

  // 获取利息设置
  const { data: interestSettings = [], refetch: refetchSettings } = trpc.ledger.getTagInterestSettings.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 获取手工调息日志（全部）
  const { data: allLogs = [], refetch: refetchLogs } = trpc.ledger.getTagInterestManualLogs.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 保存利息设置
  const saveMutation = trpc.ledger.saveTagInterestSetting.useMutation({
    onSuccess: () => {
      toast.success('保存成功');
      setEditingTag(null);
      refetchSettings();
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
  const deleteMutation = trpc.ledger.deleteTagInterestManualLog.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      refetchLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  // 构建标签数据
  const tagData = useMemo(() => {
    return categories.map((cat: any) => {
      const tagName = cat.name;
      const setting = interestSettings.find((s: any) => s.tag_name === tagName) || {};
      const principal = parseFloat(setting.interest_base_amount || '0') || 0;
      const annualRate = parseFloat(setting.interest_rate || '0') || 0;
      const startDate = setting.interest_start_date || '';
      const days = startDate ? calcDays(startDate) : 0;
      const dailyRate = annualRate > 0 ? annualRate / 100 / 365 : 0;
      const dailyInterest = principal * dailyRate;

      // 该标签的手工调整合计
      const tagLogs = allLogs.filter((l: any) => l.tag_name === tagName);
      const manualAdj = tagLogs.reduce((sum: number, l: any) => sum + parseFloat(l.amount || '0'), 0);

      const totalInterest = calcInterest(principal, annualRate, days, manualAdj);

      return { tagName, principal, annualRate, startDate, days, dailyInterest, manualAdj, totalInterest, tagLogs };
    });
  }, [categories, interestSettings, allLogs]);

  const handleEditOpen = (tagName: string, data: any) => {
    setEditingTag(tagName);
    setEditForm({
      principal: data.principal > 0 ? String(data.principal) : '',
      annualRate: data.annualRate > 0 ? String(data.annualRate) : '',
      startDate: data.startDate || '',
    });
  };

  const handleSave = (tagName: string) => {
    saveMutation.mutate({
      ledgerId: lid,
      tagName,
      principal: editForm.principal || undefined,
      annualRate: editForm.annualRate || undefined,
      startDate: editForm.startDate || undefined,
    });
  };

  const handleAddManual = (tagName: string) => {
    const amt = parseFloat(manualForm.amount);
    if (!amt || isNaN(amt)) return toast.error('请输入有效金额');
    addManualMutation.mutate({
      ledgerId: lid,
      tagName,
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
          <div className="text-xs text-gray-400">按标签设置本金·年化利率·起息日期</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {tagData.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无标签数据</div>
        ) : (
          tagData.map((tag) => (
            <div key={tag.tagName} className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {/* 标签标题行 - 点击展开/收起 */}
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedTag(expandedTag === tag.tagName ? null : tag.tagName)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-bold text-gray-900">{tag.tagName}</span>
                  {tag.days > 0 && (
                    <span className="text-xs text-gray-400">已计息 {tag.days} 天</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-600">
                      ¥ {fmt(tag.totalInterest)}
                    </div>
                    <div className="text-xs text-gray-400">累计利息</div>
                  </div>
                  {expandedTag === tag.tagName ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* 展开内容 */}
              {expandedTag === tag.tagName && (
                <div className="border-t border-gray-50">
                  {/* 利息概览 */}
                  <div className="px-4 py-3 grid grid-cols-3 gap-2 bg-blue-50/50">
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">本金</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {tag.principal > 0 ? `¥${fmt(tag.principal)}` : '未设置'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">年化利率</div>
                      <div className="text-sm font-semibold text-blue-600">
                        {tag.annualRate > 0 ? `${tag.annualRate}%` : '未设置'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">日利息</div>
                      <div className="text-sm font-semibold text-orange-600">
                        {tag.dailyInterest > 0 ? `¥${fmt(tag.dailyInterest)}` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* 利息明细 */}
                  <div className="px-4 py-3 space-y-1.5 bg-gray-50/50">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">起息日期</span>
                      <span className="text-gray-700 font-medium">{tag.startDate || '未设置'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">计息天数</span>
                      <span className="text-gray-700 font-medium">{tag.days} 天</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">自动计息</span>
                      <span className="text-green-600 font-medium">¥ {fmt(tag.totalInterest - tag.manualAdj)}</span>
                    </div>
                    {tag.manualAdj !== 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">手工调整</span>
                        <span className={`font-medium ${tag.manualAdj > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {tag.manualAdj > 0 ? '+' : ''}{fmt(tag.manualAdj)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5 mt-1">
                      <span className="text-gray-700 font-semibold">合计利息</span>
                      <span className="text-green-600 font-bold text-sm">¥ {fmt(tag.totalInterest)}</span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="px-4 py-3 flex gap-2 border-t border-gray-100">
                    <button
                      onClick={() => {
                        if (editingTag === tag.tagName) {
                          setEditingTag(null);
                        } else {
                          handleEditOpen(tag.tagName, tag);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-medium"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {editingTag === tag.tagName ? '取消编辑' : '编辑设置'}
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

                  {/* 编辑设置表单 */}
                  {editingTag === tag.tagName && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <div className="text-xs font-semibold text-gray-600 mb-2">编辑利息设置</div>
                      <div className="space-y-2.5">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">本金（元）</label>
                          <input
                            type="number"
                            value={editForm.principal}
                            onChange={(e) => setEditForm(f => ({ ...f, principal: e.target.value }))}
                            placeholder="请输入本金金额"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">年化利率（%）</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={editForm.annualRate}
                              onChange={(e) => setEditForm(f => ({ ...f, annualRate: e.target.value }))}
                              placeholder="如：12（代表12%）"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50 pr-16"
                            />
                            {editForm.annualRate && parseFloat(editForm.annualRate) > 0 && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-500">
                                日利率 {(parseFloat(editForm.annualRate) / 365).toFixed(4)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">起息日期</label>
                          <input
                            type="date"
                            value={editForm.startDate}
                            onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                          />
                        </div>
                        {/* 预览 */}
                        {editForm.principal && editForm.annualRate && editForm.startDate && (
                          <div className="bg-green-50 rounded-xl px-3 py-2 text-xs text-green-700">
                            预览：本金 ¥{fmt(parseFloat(editForm.principal))} × {editForm.annualRate}% ÷ 365 = 日利息 ¥{fmt(parseFloat(editForm.principal) * parseFloat(editForm.annualRate) / 100 / 365)}
                            {' '}· 起息 {editForm.startDate} · 已 {calcDays(editForm.startDate)} 天 · 自动利息 ¥{fmt(parseFloat(editForm.principal) * parseFloat(editForm.annualRate) / 100 / 365 * calcDays(editForm.startDate))}
                          </div>
                        )}
                        <button
                          onClick={() => handleSave(tag.tagName)}
                          disabled={saveMutation.isPending}
                          className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                        >
                          {saveMutation.isPending ? '保存中...' : '保存设置'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 手工调息表单 */}
                  {showManualForm === tag.tagName && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <div className="text-xs font-semibold text-gray-600 mb-2">手工调息</div>
                      <div className="space-y-2.5">
                        {/* 加减切换 */}
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
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">金额（元）</label>
                          <input
                            type="number"
                            value={manualForm.amount}
                            onChange={(e) => setManualForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="请输入调整金额"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">备注</label>
                          <input
                            type="text"
                            value={manualForm.remark}
                            onChange={(e) => setManualForm(f => ({ ...f, remark: e.target.value }))}
                            placeholder="请输入备注说明"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
                          />
                        </div>
                        <button
                          onClick={() => handleAddManual(tag.tagName)}
                          disabled={addManualMutation.isPending || !manualForm.amount}
                          className={`w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${manualForm.isPlus ? 'bg-green-500' : 'bg-red-500'}`}
                        >
                          {addManualMutation.isPending ? '提交中...' : `确认${manualForm.isPlus ? '加息' : '减息'} ${manualForm.amount ? `¥${manualForm.amount}` : ''}`}
                        </button>
                      </div>
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
                                    deleteMutation.mutate({ ledgerId: lid, logId: log.id });
                                  }
                                }}
                                className="ml-2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
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
