import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, RotateCcw, Loader2, Bot, User, Zap, MessageSquare,
  BarChart2, Menu, ChevronRight, RefreshCw, Trash2, Edit2, Plus, Check, X,
  PlayCircle, StopCircle, Coins, ToggleLeft, ToggleRight, Calendar, Clock,
  Settings, AlertCircle
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import CompanyReportManagement from '@/components/CompanyReportManagement';
import ToolsList from '@/components/ai/ToolsList';
import ApiKeysStatus from '@/components/ai/ApiKeysStatus';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface PromptsConfig {
  systemPrompt: string;
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
}

interface AIAssistantConfig {
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
}

interface WecomSession {
  id: number;
  wecom_user_id: string;
  manus_task_id: string;
  nickname: string;
  model_pref?: string;
  system_prompt?: string;
  enabled?: number;
  status?: string;
  task_title?: string;
  wecom_name?: string;
  wecom_avatar?: string;
  wecom_alias?: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowRule {
  id: number;
  name: string;
  trigger_type: 'keyword' | 'schedule' | 'always';
  trigger_value: string;
  action_type: 'prompt_override' | 'fixed_reply' | 'block';
  action_value: string;
  enabled: number;
  created_at: string;
}

interface UsageStat {
  nickname: string;
  wecom_user_id: string;
  total_cost: number;
  record_count: number;
  task_count: number;
  first_bound_at: string;
}

interface MenuItem {
  type: 'click' | 'view';
  name: string;
  key?: string;
  url?: string;
  sub_button?: MenuItem[];
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'manus-1.6-max', label: 'Max', desc: '最强能力' },
  { value: 'manus-1.6', label: '标准', desc: '平衡性能' },
  { value: 'manus-1.6-lite', label: '轻量', desc: '快速省积分' },
];

const MODEL_COLOR: Record<string, string> = {
  'manus-1.6-max': 'bg-purple-100 text-purple-700',
  'manus-1.6': 'bg-blue-100 text-blue-700',
  'manus-1.6-lite': 'bg-green-100 text-green-700',
};

const FEATURE_LABELS: Record<string, string> = {
  crypto_ai_analysis: '加密货币AI分析',
  generate_story: '儿童故事生成',
  recognize_business_card: '名片识别',
  recognize_address: '地址识别',
  recognize_bank: '银行信息识别',
  ai_insights: '客户意见洞察',
  recognize_qq_trade: 'QQ交易图识别',
  analyze_skin: '皮肤分析',
  gold_ai_analysis: '黄金AI分析',
  eth_position_analyze: 'ETH持仓分析',
  diet_analysis: '饮食营养分析',
  lottery_analysis: '抽奖文案生成',
  okx_trader_chat: 'OKX交易AI对话',
  prediction_analysis: '预测市场分析',
  bank_account_parser: '银行流水解析',
  ocr_recognize: 'OCR文字识别',
  ai_employee: 'AI员工(定时任务)',
  ai_search: 'AI搜索增强',
  company_reports: '公司报告生成',
  db_ai_assistant: 'AI数据助手',
  ai_background_check: 'AI背景调查',
  food_calorie_scan: '食物热量扫描',
};

const FEATURE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-yellow-100 text-yellow-700',
];

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const ts = Number(dateStr);
  const d = isNaN(ts) || dateStr.includes('-') ? new Date(dateStr) : new Date(ts * 1000);
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function formatShortDate(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function calcDays(dateStr: string) {
  if (!dateStr) return '-';
  const normalized = dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : '+08:00');
  const start = new Date(normalized).getTime();
  const now = Date.now();
  const diff = now - start;
  if (diff < 0) return '1天';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days === 0 ? '1天' : `${days}天`;
}

function creditsToYuan(credits: number) {
  return (credits * 0.037).toFixed(2);
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// ─── Tab 类型 ────────────────────────────────────────────────────────────────

type MainTab = 'wecom' | 'token' | 'assistant' | 'cert' | 'params' | 'reports';

const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: 'wecom', label: '企微AI', icon: <Bot className="w-4 h-4" /> },
  { key: 'token', label: 'Token', icon: <Zap className="w-4 h-4" /> },
  { key: 'assistant', label: 'AI助手', icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'cert', label: '企业认证', icon: <Settings className="w-4 h-4" /> },
  { key: 'params', label: '参数', icon: <BarChart2 className="w-4 h-4" /> },
  { key: 'reports', label: '企业报告', icon: <AlertCircle className="w-4 h-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════════

export default function AIManagement() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<MainTab>('wecom');

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => setLocation('/parent/profile')} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <Bot className="w-5 h-5 text-blue-600" />
        <h1 className="text-base font-semibold text-gray-900 flex-1">AI 管理</h1>
      </div>

      {/* Tab 内容 */}
      <div className="pt-3">
        {activeTab === 'wecom' && <WecomPanel />}
        {activeTab === 'token' && <TokenMonitorPanel />}
        {activeTab === 'assistant' && <AssistantPanel />}
        {activeTab === 'cert' && <CertPanel />}
        {activeTab === 'params' && <ParamsPanel />}
        {activeTab === 'reports' && <ReportsPanel />}
      </div>

      {/* 底部 Tab 栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 max-w-md mx-auto">
        <div className="flex overflow-x-auto">
          {MAIN_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors min-w-0 ${
                activeTab === tab.key ? 'text-blue-600 font-medium' : 'text-gray-400'
              }`}
            >
              {tab.icon}
              <span className="truncate w-full text-center">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 1: 企微 AI（原 WecomAdmin 内容）
// ═══════════════════════════════════════════════════════════════════════════════

type WecomTabKey = 'users' | 'workflow' | 'messages' | 'stats' | 'menu';

const WECOM_TABS: { key: WecomTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'users', label: '用户', icon: <User className="w-3.5 h-3.5" /> },
  { key: 'workflow', label: '工作流', icon: <Zap className="w-3.5 h-3.5" /> },
  { key: 'messages', label: '消息', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: 'stats', label: '统计', icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { key: 'menu', label: '菜单', icon: <Menu className="w-3.5 h-3.5" /> },
];

function WecomPanel() {
  const [activeTab, setActiveTab] = useState<WecomTabKey>('users');

  return (
    <div>
      {/* 二级 Tab 栏 */}
      <div className="px-4 pb-2">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {WECOM_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-xs rounded-lg transition-all ${
                activeTab === tab.key ? 'bg-white text-blue-600 font-medium shadow-sm' : 'text-gray-500'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-1">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'workflow' && <WorkflowTab />}
        {activeTab === 'messages' && <MessagesTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'menu' && <MenuTab />}
      </div>
    </div>
  );
}

// ─── SearchSelect ────────────────────────────────────────────────────────────

interface ManusTask { id: string; title: string; agent_profile?: string; }

function SearchSelect({
  options, value, onChange, placeholder, displayKey, valueKey, labelKey
}: {
  options: any[];
  value: string;
  onChange: (val: string, label?: string) => void;
  placeholder: string;
  displayKey: string;
  valueKey: string;
  labelKey?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const filtered = options.filter(o =>
    (o[displayKey] || '').toLowerCase().includes(search.toLowerCase()) ||
    (o[valueKey] || '').toLowerCase().includes(search.toLowerCase())
  );
  const handleSelect = (o: any) => {
    const label = o[displayKey] || o[valueKey];
    setSelectedLabel(label);
    onChange(o[valueKey], label);
    setSearch('');
    setOpen(false);
  };
  return (
    <div className="relative">
      <div
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between cursor-pointer bg-white"
        onClick={() => setOpen(v => !v)}
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">无匹配结果</div>
            ) : filtered.map(o => (
              <div
                key={o[valueKey]}
                className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 ${
                  value === o[valueKey] ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
                onClick={() => handleSelect(o)}
              >
                <div className="font-medium">{o[displayKey]}</div>
                {labelKey && o[labelKey] && o[labelKey] !== o[displayKey] && (
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{o[labelKey]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── UsersTab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ nickname: string; manus_task_id: string; model_pref: string; system_prompt: string }>({
    nickname: '', manus_task_id: '', model_pref: 'manus-1.6-max', system_prompt: ''
  });
  const [manusTasks, setManusTasks] = useState<ManusTask[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ wecom_user_id: '', nickname: '', manus_task_id: '', model_pref: 'manus-1.6-max', system_prompt: '' });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/sessions');
      const data = await res.json();
      if (data.ok) setSessions(data.sessions || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchDropdownData = useCallback(async () => {
    try {
      const res = await fetch('/api/wecom/manus-tasks');
      const data = await res.json();
      if (data.ok) setManusTasks(data.tasks || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleSaveEdit = async (session: WecomSession) => {
    try {
      const res = await fetch(`/api/wecom/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.ok) { toast.success('已保存'); setEditingId(null); fetchSessions(); }
      else toast.error(data.error || '保存失败');
    } catch { toast.error('网络错误'); }
  };

  const handleToggleEnabled = async (session: WecomSession) => {
    try {
      const res = await fetch(`/api/wecom/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: session.enabled === 0 ? 1 : 0 }),
      });
      const data = await res.json();
      if (data.ok) { fetchSessions(); toast.success(session.enabled === 0 ? '已启用' : '已禁用'); }
    } catch { toast.error('网络错误'); }
  };

  const handleArchive = async (id: number, name: string) => {
    if (!confirm(`确认归档 ${name || id}？归档后保留积分记录但停止服务。`)) return;
    try {
      const res = await fetch(`/api/wecom/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      const data = await res.json();
      if (data.ok) { toast.success('已归档'); fetchSessions(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
  };

  const handleAddSession = async () => {
    if (!addForm.wecom_user_id || !addForm.manus_task_id) {
      toast.error('企微用户ID和Manus任务ID为必填项');
      return;
    }
    try {
      const res = await fetch('/api/wecom/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('用户已绑定');
        setShowAddForm(false);
        setAddForm({ wecom_user_id: '', nickname: '', manus_task_id: '', model_pref: 'manus-1.6-max', system_prompt: '' });
        fetchSessions();
      } else toast.error(data.error || '绑定失败');
    } catch { toast.error('网络错误'); }
  };

  return (
    <div className="px-4 space-y-3">
      {/* 操作栏 */}
      <div className="flex gap-2">
        <button
          onClick={fetchSessions}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => { setShowAddForm(!showAddForm); fetchDropdownData(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          绑定新用户
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-blue-100">
          <div className="text-sm font-medium text-gray-700">绑定新用户</div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">企微用户ID（必填）</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="如：ZhangSan"
              value={addForm.wecom_user_id}
              onChange={e => setAddForm(f => ({ ...f, wecom_user_id: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注名</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="显示名称"
              value={addForm.nickname}
              onChange={e => setAddForm(f => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Manus 任务（必填）</label>
            {manusTasks.length > 0 ? (
              <SearchSelect
                options={manusTasks}
                value={addForm.manus_task_id}
                onChange={val => setAddForm(f => ({ ...f, manus_task_id: val }))}
                placeholder="选择 Manus 任务..."
                displayKey="title"
                valueKey="id"
                labelKey="id"
              />
            ) : (
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="Manus 任务 ID"
                value={addForm.manus_task_id}
                onChange={e => setAddForm(f => ({ ...f, manus_task_id: e.target.value }))}
              />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">默认模型</label>
            <div className="grid grid-cols-3 gap-2">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAddForm(f => ({ ...f, model_pref: opt.value }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    addForm.model_pref === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddSession}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
            >
              <Check className="w-4 h-4" /> 确认绑定
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
            >
              <X className="w-4 h-4" /> 取消
            </button>
          </div>
        </div>
      )}

      {/* 用户列表 */}
      {loading && sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无绑定用户</div>
      ) : (
        sessions.map(session => (
          <div key={session.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
            {editingId === session.id ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700">{session.wecom_user_id}</span>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">备注名</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={editForm.nickname || ''}
                    onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Manus 任务</label>
                  {manusTasks.length > 0 ? (
                    <SearchSelect
                      options={manusTasks}
                      value={editForm.manus_task_id || ''}
                      onChange={val => setEditForm(f => ({ ...f, manus_task_id: val }))}
                      placeholder="选择 Manus 任务..."
                      displayKey="title"
                      valueKey="id"
                      labelKey="id"
                    />
                  ) : (
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                      value={editForm.manus_task_id || ''}
                      onChange={e => setEditForm(f => ({ ...f, manus_task_id: e.target.value }))}
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">默认模型</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODEL_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setEditForm(f => ({ ...f, model_pref: opt.value }))}
                        className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                          (editForm.model_pref || 'manus-1.6-max') === opt.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">系统提示词</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={4}
                    placeholder="设置后，每次用户发消息时会在前面附加这段提示词，用于约束回复格式、范围等。"
                    value={editForm.system_prompt || ''}
                    onChange={e => setEditForm(f => ({ ...f, system_prompt: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(session)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
                  >
                    <Check className="w-4 h-4" /> 保存
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
                  >
                    <X className="w-4 h-4" /> 取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {session.wecom_avatar ? (
                      <img
                        src={session.wecom_avatar}
                        alt="avatar"
                        className={`w-9 h-9 rounded-full object-cover border-2 ${
                          session.enabled === 0 ? 'border-gray-200 opacity-50' : 'border-blue-100'
                        }`}
                      />
                    ) : (
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        session.enabled === 0 ? 'bg-gray-100' : 'bg-blue-100'
                      }`}>
                        <User className={`w-4 h-4 ${session.enabled === 0 ? 'text-gray-400' : 'text-blue-600'}`} />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {session.wecom_name || session.nickname || session.wecom_user_id}
                        {session.wecom_alias && (
                          <span className="ml-1 text-xs text-gray-400 font-normal">({session.wecom_alias})</span>
                        )}
                        {session.status === 'archived' && (
                          <span className="ml-1.5 text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-normal">已归档</span>
                        )}
                        {session.enabled === 0 && session.status !== 'archived' && (
                          <span className="ml-1.5 text-xs text-orange-400 font-normal">已禁用</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{session.wecom_user_id}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    MODEL_COLOR[session.model_pref || 'manus-1.6-max']
                  }`}>
                    {MODEL_OPTIONS.find(m => m.value === (session.model_pref || 'manus-1.6-max'))?.label || 'Max'}
                  </span>
                </div>

                {session.task_title && (
                  <div className="text-xs text-blue-600 font-medium truncate mb-0.5">{session.task_title}</div>
                )}
                <div className="text-xs text-gray-400 font-mono truncate mb-1">
                  任务: {session.manus_task_id}
                </div>
                {session.system_prompt && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-2 line-clamp-2">
                    提示词: {session.system_prompt}
                  </div>
                )}
                <div className="text-xs text-gray-400 mb-3">
                  绑定于 {formatDate(session.created_at)}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(session.id);
                      setEditForm({ nickname: session.nickname, manus_task_id: session.manus_task_id, model_pref: session.model_pref || 'manus-1.6-max', system_prompt: session.system_prompt || '' });
                      fetchDropdownData();
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs border border-gray-200"
                  >
                    <Edit2 className="w-3 h-3" /> 编辑
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(session)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border ${
                      session.enabled === 0
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : 'bg-orange-50 text-orange-600 border-orange-200'
                    }`}
                  >
                    {session.enabled === 0 ? <PlayCircle className="w-3 h-3" /> : <StopCircle className="w-3 h-3" />}
                    {session.enabled === 0 ? '启用' : '禁用'}
                  </button>
                  <button
                    onClick={() => handleArchive(session.id, session.nickname)}
                    title="归档（保留积分记录）"
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-500 rounded-lg text-xs border border-orange-200"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── WorkflowTab ─────────────────────────────────────────────────────────────

function WorkflowTab() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    trigger_type: 'keyword' as WorkflowRule['trigger_type'],
    trigger_value: '',
    action_type: 'prompt_override' as WorkflowRule['action_type'],
    action_value: '',
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/workflow-rules');
      const data = await res.json();
      if (data.ok) setRules(data.rules || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.trigger_value || !addForm.action_value) {
      toast.error('请填写完整信息');
      return;
    }
    try {
      const res = await fetch('/api/wecom/workflow-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('规则已创建');
        setShowAdd(false);
        setAddForm({ name: '', trigger_type: 'keyword', trigger_value: '', action_type: 'prompt_override', action_value: '' });
        fetchRules();
      } else toast.error(data.error || '创建失败');
    } catch { toast.error('网络错误'); }
  };

  const handleToggle = async (rule: WorkflowRule) => {
    try {
      const res = await fetch(`/api/wecom/workflow-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: rule.enabled ? 0 : 1 }),
      });
      const data = await res.json();
      if (data.ok) { fetchRules(); toast.success(rule.enabled ? '已停用' : '已启用'); }
    } catch { toast.error('网络错误'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此规则？')) return;
    try {
      const res = await fetch(`/api/wecom/workflow-rules/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { toast.success('已删除'); fetchRules(); }
    } catch { toast.error('网络错误'); }
  };

  const TRIGGER_LABELS: Record<string, string> = {
    keyword: '关键词触发',
    schedule: '定时触发',
    always: '每次触发',
  };

  const ACTION_LABELS: Record<string, string> = {
    prompt_override: '注入提示词',
    fixed_reply: '固定回复',
    block: '拦截消息',
  };

  const ACTION_COLORS: Record<string, string> = {
    prompt_override: 'bg-blue-100 text-blue-700',
    fixed_reply: 'bg-green-100 text-green-700',
    block: 'bg-red-100 text-red-700',
  };

  return (
    <div className="px-4 space-y-3">
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <div className="text-xs font-medium text-blue-800 mb-1">工作流规则</div>
        <div className="text-xs text-blue-600 leading-relaxed">
          当用户发送消息时，按规则顺序匹配。可设置关键词触发、定时推送、消息拦截等自动化规则。
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={fetchRules}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新建规则
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-blue-100">
          <div className="text-sm font-medium text-gray-700">新建工作流规则</div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">规则名称</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="如：屏蔽广告关键词"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">触发方式</label>
            <div className="grid grid-cols-3 gap-2">
              {(['keyword', 'schedule', 'always'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAddForm(f => ({ ...f, trigger_type: t }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    addForm.trigger_type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {TRIGGER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {addForm.trigger_type === 'keyword' ? '关键词（多个用逗号分隔）' : addForm.trigger_type === 'schedule' ? 'Cron 表达式（如 0 9 * * *）' : '触发条件（填写 always）'}
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder={addForm.trigger_type === 'keyword' ? '如：你好,hello' : addForm.trigger_type === 'schedule' ? '0 9 * * *' : 'always'}
              value={addForm.trigger_value}
              onChange={e => setAddForm(f => ({ ...f, trigger_value: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">动作类型</label>
            <div className="grid grid-cols-3 gap-2">
              {(['prompt_override', 'fixed_reply', 'block'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setAddForm(f => ({ ...f, action_type: a }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    addForm.action_type === a ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          </div>
          {addForm.action_type !== 'block' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {addForm.action_type === 'prompt_override' ? '注入的提示词内容' : '固定回复内容'}
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                rows={3}
                value={addForm.action_value}
                onChange={e => setAddForm(f => ({ ...f, action_value: e.target.value }))}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              <Check className="w-4 h-4" /> 创建
            </button>
            <button onClick={() => setShowAdd(false)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
              <X className="w-4 h-4" /> 取消
            </button>
          </div>
        </div>
      )}

      {loading && rules.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无工作流规则</div>
      ) : (
        rules.map(rule => (
          <div key={rule.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {TRIGGER_LABELS[rule.trigger_type]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_COLORS[rule.action_type]}`}>
                    {ACTION_LABELS[rule.action_type]}
                  </span>
                </div>
              </div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {rule.enabled ? '运行中' : '已停用'}
              </div>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-2">
              <span className="text-gray-400">触发: </span>{rule.trigger_value}
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-3 line-clamp-2">
              <span className="text-gray-400">动作: </span>{rule.action_value || '（拦截，不回复）'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggle(rule)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border ${
                  rule.enabled ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'
                }`}
              >
                {rule.enabled ? <StopCircle className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                {rule.enabled ? '停用' : '启用'}
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs border border-red-200"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── MessagesTab ─────────────────────────────────────────────────────────────

function MessagesTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [selectedUser, setSelectedUser] = useState<WecomSession | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    setLoadingUsers(true);
    fetch('/api/wecom/sessions')
      .then(r => r.json())
      .then(d => { if (d.ok) setSessions(d.sessions || []); })
      .finally(() => setLoadingUsers(false));
  }, []);

  const loadMessages = async (session: WecomSession) => {
    setSelectedUser(session);
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/wecom/messages/${session.manus_task_id}`);
      const data = await res.json();
      if (data.ok) setMessages(data.messages || []);
      else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoadingMsgs(false); }
  };

  if (selectedUser) {
    return (
      <div className="px-4 space-y-3">
        <div className="flex items-center gap-2 py-1">
          <button onClick={() => setSelectedUser(null)} className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="text-sm font-medium text-gray-900">{selectedUser.nickname || selectedUser.wecom_user_id}</div>
            <div className="text-xs text-gray-400">消息记录</div>
          </div>
        </div>
        {loadingMsgs ? (
          <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">暂无消息记录</div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg: any, i: number) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 shadow-sm border border-gray-100'
                }`}>
                  <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.timestamp && (
                    <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {formatDate(msg.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 space-y-3">
      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
        <div className="text-xs text-gray-500">选择用户查看其与 Manus AI 的对话记录</div>
      </div>
      {loadingUsers ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无绑定用户</div>
      ) : (
        sessions.map(session => (
          <button
            key={session.id}
            onClick={() => loadMessages(session)}
            className="w-full bg-white rounded-xl shadow-sm p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              {session.wecom_avatar ? (
                <img src={session.wecom_avatar} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-blue-100" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {session.wecom_name || session.nickname || session.wecom_user_id}
                  {session.wecom_alias && <span className="ml-1 text-xs text-gray-400">({session.wecom_alias})</span>}
                </div>
                {session.task_title ? (
                  <div className="text-xs text-blue-500 truncate max-w-[180px]">{session.task_title}</div>
                ) : (
                  <div className="text-xs text-gray-400">{session.wecom_user_id}</div>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))
      )}
    </div>
  );
}

// ─── StatsTab ─────────────────────────────────────────────────────────────────

interface UserDetailSession {
  id: number;
  manus_task_id: string;
  nickname: string;
  status: string;
  created_at: string;
  task_title: string;
  total_cost: number;
  record_count: number;
}

interface UserDetailRecord {
  id?: number;
  task_id: string;
  task_status?: string;
  credits: number;
  credits_before?: number;
  credits_after?: number;
  created_at: string;
  model: string;
  record_type?: 'message' | 'task';
  user_message?: string;
  reply_preview?: string;
}

function UserDetailModal({ wecomUserId, displayName, onClose }: { wecomUserId: string; displayName: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<UserDetailSession[]>([]);
  const [records, setRecords] = useState<UserDetailRecord[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);
  const [useMessageCredits, setUseMessageCredits] = useState(false);

  const creditsToUsdt = (credits: number) => (credits * 0.037).toFixed(2);

  useEffect(() => {
    fetch(`/api/wecom/user-detail?wecom_user_id=${encodeURIComponent(wecomUserId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setSessions(data.sessions || []);
          setRecords(data.records || []);
          setUseMessageCredits(!!data.use_message_credits);
        } else toast.error(data.error || '加载失败');
      })
      .catch(() => toast.error('网络错误'))
      .finally(() => setLoading(false));
  }, [wecomUserId]);

  const totalCost = sessions.reduce((s, t) => s + t.total_cost, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">{displayName}</div>
          <div className="text-xs text-gray-400">
            {wecomUserId} · 积分账本
            {useMessageCredits && <span className="ml-1 text-green-500">· 消息级</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-blue-600">{Math.round(totalCost)}</div>
          <div className="text-xs text-gray-400">总消耗算力</div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">暂无绑定记录</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {sessions.map((s) => {
            const taskRecords = records.filter(r => r.task_id === s.manus_task_id);
            const isExpanded = expandedTask === s.manus_task_id;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                  className="px-4 py-3 flex items-start justify-between cursor-pointer active:bg-gray-50"
                  onClick={() => setExpandedTask(isExpanded ? null : s.manus_task_id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{s.status === 'active' ? '当前' : '已归档'}</span>
                      <span className="text-xs text-gray-400">{formatDate(s.created_at)} 绑定</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 truncate">{s.task_title || s.manus_task_id}</div>
                    {s.task_title && <div className="text-xs text-gray-400 font-mono truncate mt-0.5">{s.manus_task_id}</div>}
                  </div>
                  <div className="ml-3 text-right flex-shrink-0">
                    <div className="text-sm font-bold text-blue-600">{Math.round(s.total_cost)}</div>
                    <div className="text-xs text-gray-400">{s.record_count} 条</div>
                  </div>
                  <ChevronRight className={`ml-2 w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {taskRecords.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-400 text-center">暂无积分消耗记录</div>
                    ) : useMessageCredits ? (
                      <div>
                        <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-400 font-medium">
                          <span>用户消息</span>
                          <span>消耗算力 / 元</span>
                        </div>
                        {taskRecords.map((r, i) => {
                          const isExpMsg = expandedMsg === (r.id ?? i);
                          return (
                            <div key={r.id ?? i} className="border-b border-gray-50 last:border-0">
                              <div
                                className="px-4 py-2.5 flex items-start gap-2 cursor-pointer active:bg-gray-50"
                                onClick={() => setExpandedMsg(isExpMsg ? null : (r.id ?? i))}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-500 mb-0.5">{formatDate(r.created_at)}</div>
                                  <div className="text-sm text-gray-800 truncate">{r.user_message || '(无内容)'}</div>
                                </div>
                                <div className="flex-shrink-0 text-right ml-2">
                                  <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                                  <div className="text-xs text-green-600">{creditsToYuan(r.credits)}</div>
                                </div>
                                <ChevronRight className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1 transition-transform ${isExpMsg ? 'rotate-90' : ''}`} />
                              </div>
                              {isExpMsg && (
                                <div className="px-4 pb-3 bg-gray-50 space-y-2">
                                  {r.reply_preview && (
                                    <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                                      <div className="text-xs text-gray-400 mb-1">AI 回复预览</div>
                                      <div className="text-xs text-gray-700 leading-relaxed">{r.reply_preview}</div>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>算力 {r.credits_before ?? '?'} → {r.credits_after ?? '?'}</span>
                                    <span>{creditsToUsdt(r.credits)} 元</span>
                                  </div>
                                  {r.model && <div className="text-xs text-gray-400">模型: {r.model}</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div>
                        <div className="px-4 py-2 bg-gray-50 grid grid-cols-3 text-xs text-gray-400 font-medium">
                          <span>时间</span>
                          <span className="text-center">消耗算力</span>
                          <span className="text-right">元</span>
                        </div>
                        {taskRecords.map((r, i) => (
                          <div key={i} className="px-4 py-2.5 grid grid-cols-3 items-center border-b border-gray-50 last:border-0">
                            <div>
                              <div className="text-xs text-gray-700">{formatDate(r.created_at)}</div>
                              {r.model && <div className="text-xs text-gray-400 mt-0.5">{r.model}</div>}
                            </div>
                            <div className="text-sm font-medium text-blue-600 text-center">-{Math.round(r.credits)}</div>
                            <div className="text-right">
                              <div className="text-xs font-medium text-green-600">{creditsToYuan(r.credits)}</div>
                              <div className="text-xs text-gray-400">{creditsToUsdt(r.credits)} 元</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<UsageStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [viewMode, setViewMode] = useState<'user' | 'time' | 'rank'>('user');
  const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);

  const creditsToUsdt = (credits: number) => (credits * 0.037).toFixed(2);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/stats');
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats || []);
        setTotalCost(data.total_cost || 0);
      } else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const rankStats = [...stats].sort((a, b) => b.total_cost - a.total_cost);

  if (detailUser) {
    return <UserDetailModal wecomUserId={detailUser.id} displayName={detailUser.name} onClose={() => setDetailUser(null)} />;
  }

  return (
    <div className="px-4 space-y-3">
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-blue-200" />
          <span className="text-sm text-blue-100">企微渠道累计消耗</span>
        </div>
        <div className="text-3xl font-bold">{Math.round(totalCost)}</div>
        <div className="text-sm text-blue-200 mt-0.5">积分</div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex bg-gray-100 rounded-xl p-1 flex-1">
          {(['user', 'time', 'rank'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {mode === 'user' ? '按用户' : mode === 'time' ? '按时间' : '按积分'}
            </button>
          ))}
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-600"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading && stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无使用记录</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          {viewMode === 'user' && (
            <table className="min-w-full border-collapse text-sm" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200">用户（点击查看明细）</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-20">开始时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">累计时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-14">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">消耗算力</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 w-16">元</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}
                  >
                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {stat.wecom_user_id}
                        {stat.task_count > 1 && <span className="ml-1.5 text-orange-500">共 {stat.task_count} 个任务</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100">{formatShortDate(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100">{calcDays(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-600 border-r border-gray-100">{Math.round(stat.total_cost)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-green-600">{creditsToYuan(stat.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'time' && (
            <table className="min-w-full border-collapse text-sm" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200">用户（最早绑定在前）</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-20">开始时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">累计时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-14">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">消耗算力</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 w-16">元</th>
                </tr>
              </thead>
              <tbody>
                {[...stats].sort((a, b) => new Date(a.first_bound_at).getTime() - new Date(b.first_bound_at).getTime()).reverse().map((stat, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}
                  >
                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100">{formatShortDate(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100">{calcDays(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-600 border-r border-gray-100">{Math.round(stat.total_cost)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-green-600">{creditsToYuan(stat.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'rank' && (
            <table className="min-w-full border-collapse text-sm" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-10">排名</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200">用户</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-20">开始时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-14">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">消耗算力</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 w-16">元</th>
                </tr>
              </thead>
              <tbody>
                {rankStats.map((stat, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}
                  >
                    <td className="px-3 py-2.5 text-center border-r border-gray-100">
                      <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100">{formatShortDate(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-600 border-r border-gray-100">{Math.round(stat.total_cost)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-green-600">{creditsToYuan(stat.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MenuTab ─────────────────────────────────────────────────────────────────

interface MenuItemType { name: string; type: string; key?: string; sub_button?: MenuItemType[]; }

const DEFAULT_WECOM_MENU: MenuItemType[] = [
  {
    name: '切换模型', type: 'click', key: '',
    sub_button: [
      { name: 'Max 模式', type: 'click', key: 'MODEL_MAX' },
      { name: '标准模式', type: 'click', key: 'MODEL_NORMAL' },
      { name: '轻量模式', type: 'click', key: 'MODEL_LITE' },
      { name: 'DeepSeek', type: 'click', key: 'MODEL_DS_FLASH' },
      { name: '', type: 'click', key: 'RESERVED_1_5' },
    ],
  },
  {
    name: '工具箱', type: 'click', key: '',
    sub_button: [
      { name: '查积分', type: 'click', key: 'CREDITS_QUERY' },
      { name: '新对话', type: 'click', key: 'NEW_TASK' },
      { name: '任务状态', type: 'click', key: 'TASK_STATUS' },
      { name: '预留', type: 'click', key: 'RESERVED_2_4' },
      { name: '预留', type: 'click', key: 'RESERVED_2_5' },
    ],
  },
  {
    name: '更多', type: 'click', key: '',
    sub_button: [
      { name: '使用帮助', type: 'click', key: 'HELP' },
      { name: '意见反馈', type: 'click', key: 'FEEDBACK' },
      { name: '预留', type: 'click', key: 'RESERVED_3_3' },
      { name: '预留', type: 'click', key: 'RESERVED_3_4' },
      { name: '预留', type: 'click', key: 'RESERVED_3_5' },
    ],
  },
];

function MenuTab() {
  const [menu, setMenu] = useState<MenuItemType[]>(DEFAULT_WECOM_MENU);
  const [draft, setDraft] = useState<MenuItemType[]>(DEFAULT_WECOM_MENU);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const handleEdit = () => {
    setDraft(JSON.parse(JSON.stringify(menu)));
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(menu)));
    setEditing(false);
  };

  const handleNameChange = (i: number, j: number | null, val: string) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    if (j === null) m[i].name = val;
    else if (m[i].sub_button) m[i].sub_button![j].name = val;
    setDraft(m);
  };

  const handleKeyChange = (i: number, j: number, val: string) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    if (m[i].sub_button) m[i].sub_button![j].key = val;
    setDraft(m);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/wecom/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu: draft }),
      });
      const data = await res.json();
      if (data.ok) {
        setMenu(JSON.parse(JSON.stringify(draft)));
        setEditing(false);
        toast.success('菜单已推送，企业微信端稍后生效');
      } else {
        toast.error(data.error || '推送失败，请重试');
      }
    } catch { toast.error('网络错误，请重试'); }
    finally { setSaving(false); }
  };

  const displayMenu = editing ? draft : menu;

  return (
    <div className="px-4 space-y-3">
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-amber-800 mb-0.5">菜单配置</div>
            <div className="text-xs text-amber-700">
              {editing ? '编辑模式 — 修改完成后点击推送' : '企业微信最多3个一级菜单，每个下最多5个子菜单'}
            </div>
          </div>
          {!editing && (
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium"
            >
              编辑
            </button>
          )}
        </div>
      </div>

      {displayMenu.map((item, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            className="w-full px-4 py-3 flex items-center justify-between"
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                {i + 1}
              </div>
              <span className="text-sm font-medium text-gray-900">{item.name}</span>
              <span className="text-xs text-gray-400">({item.sub_button?.length || 0} 个子菜单)</span>
            </div>
            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedIdx === i ? 'rotate-90' : ''}`} />
          </button>

          {expandedIdx === i && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
              <div className="pt-3">
                <label className="text-xs text-gray-500 mb-1 block">一级菜单名称（最多4字）</label>
                <input
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${
                    editing ? 'border-gray-200 bg-white' : 'border-transparent bg-gray-50 text-gray-700'
                  }`}
                  value={item.name}
                  onChange={e => editing && handleNameChange(i, null, e.target.value)}
                  readOnly={!editing}
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600">子菜单</div>
                {item.sub_button?.map((sub, j) => (
                  <div key={j} className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4">{j + 1}.</span>
                      <input
                        className={`flex-1 border rounded-lg px-2 py-1.5 text-xs ${
                          editing ? 'border-gray-200 bg-white' : 'border-transparent bg-gray-100 text-gray-700'
                        }`}
                        placeholder="菜单名称（最多4字）"
                        value={sub.name}
                        onChange={e => editing && handleNameChange(i, j, e.target.value)}
                        readOnly={!editing}
                        maxLength={4}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4"></span>
                      <input
                        className={`flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono ${
                          editing ? 'border-gray-200 bg-white' : 'border-transparent bg-gray-100 text-gray-500'
                        }`}
                        placeholder="Key（如：MODEL_MAX）"
                        value={sub.key || ''}
                        onChange={e => editing && handleKeyChange(i, j, e.target.value)}
                        readOnly={!editing}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {editing && (
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3 bg-red-600 text-white rounded-xl text-sm font-medium disabled:opacity-60"
          >
            {saving ? '推送中...' : '推送菜单到企业微信'}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 2: Token 监控（原 AiTokenMonitor 内容）
// ═══════════════════════════════════════════════════════════════════════════════

function TokenMonitorPanel() {
  const [dateRange, setDateRange] = useState(3);
  const { startDate, endDate } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const { data: switches, refetch: refetchSwitches, isLoading: switchesLoading } =
    trpc.aiMonitor.getSwitches.useQuery();

  const { data: usageStats, isLoading: usageLoading, refetch: refetchUsage } =
    trpc.aiMonitor.getUsageStats.useQuery({ startDate, endDate });

  const { data: dailyStats, isLoading: dailyLoading } =
    trpc.aiMonitor.getDailyStats.useQuery({ startDate, endDate });

  const toggleMutation = trpc.aiMonitor.toggleSwitch.useMutation({
    onSuccess: () => { refetchSwitches(); toast.success('开关已更新'); },
    onError: (e) => toast.error('操作失败：' + e.message),
  });

  const handleToggle = (featureKey: string, currentEnabled: boolean) => {
    toggleMutation.mutate({ featureKey, enabled: !currentEnabled });
  };

  const totalTokens = usageStats?.reduce((sum: number, s: any) => sum + (Number(s.total_tokens) || 0), 0) || 0;
  const totalCalls = usageStats?.reduce((sum: number, s: any) => sum + (Number(s.call_count) || 0), 0) || 0;
  const totalCostUsd = usageStats?.reduce((sum: number, s: any) => sum + (Number(s.total_cost_usd) || 0), 0) || 0;

  return (
    <div className="px-4 space-y-3">
      {/* 日期范围选择 */}
      <div className="flex gap-2">
        {[3, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDateRange(d)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dateRange === d ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            近{d}天
          </button>
        ))}
        <button
          onClick={() => { refetchSwitches(); refetchUsage(); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">总调用次数</div>
          <div className="text-lg font-bold text-purple-600">{totalCalls.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">总Token数</div>
          <div className="text-lg font-bold text-blue-600">{(totalTokens / 1000).toFixed(1)}K</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">估算费用</div>
          <div className="text-lg font-bold text-orange-600">${totalCostUsd.toFixed(4)}</div>
        </div>
      </div>

      {/* 每日趋势 */}
      {!dailyLoading && dailyStats && dailyStats.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">每日消耗</h3>
          </div>
          <div className="space-y-2">
            {dailyStats.map((day: any) => {
              const maxTokens = Math.max(...dailyStats.map((d: any) => Number(d.total_tokens) || 0), 1);
              const pct = Math.round(((Number(day.total_tokens) || 0) / maxTokens) * 100);
              return (
                <div key={day.date} className="flex items-center gap-2">
                  <div className="text-xs text-gray-500 w-16 shrink-0">{String(day.date)?.slice(5)}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-600 w-14 text-right shrink-0">
                    {((Number(day.total_tokens) || 0) / 1000).toFixed(1)}K
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 功能用量排行 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">功能用量排行</h3>
        </div>
        {usageLoading ? (
          <div className="text-center text-gray-400 text-sm py-4">加载中…</div>
        ) : !usageStats || usageStats.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6">暂无数据</div>
        ) : (
          <div className="space-y-3">
            {[...(usageStats as any[])]
              .sort((a, b) => (Number(b.total_tokens) || 0) - (Number(a.total_tokens) || 0))
              .map((stat: any, idx: number) => {
                const maxTokens = Math.max(...(usageStats as any[]).map((s: any) => Number(s.total_tokens) || 0), 1);
                const pct = Math.round(((Number(stat.total_tokens) || 0) / maxTokens) * 100);
                const colorClass = FEATURE_COLORS[idx % FEATURE_COLORS.length];
                const label = FEATURE_LABELS[stat.feature_key] || stat.feature_label || stat.feature_key;
                return (
                  <div key={stat.feature_key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>{label}</span>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">{Number(stat.call_count)}次</span>
                        <span className="text-xs text-gray-400 mx-1">·</span>
                        <span className="text-xs font-medium text-gray-700">{((Number(stat.total_tokens) || 0) / 1000).toFixed(1)}K tokens</span>
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 功能开关控制 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">功能开关控制</h3>
          <span className="text-xs text-gray-400 ml-auto">关闭后不再消耗Token</span>
        </div>
        {switchesLoading ? (
          <div className="text-center text-gray-400 text-sm py-4">加载中…</div>
        ) : !switches || switches.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6">暂无功能记录</div>
        ) : (
          <div className="space-y-2">
            {(switches as any[]).map((sw: any) => {
              const label = FEATURE_LABELS[sw.feature_key] || sw.feature_label || sw.feature_key;
              const isEnabled = sw.enabled !== 0 && sw.enabled !== false;
              return (
                <div key={sw.feature_key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm text-gray-800">{label}</div>
                    <div className="text-xs text-gray-400">{sw.feature_key}</div>
                  </div>
                  <button
                    onClick={() => handleToggle(sw.feature_key, isEnabled)}
                    disabled={toggleMutation.isPending}
                    className="ml-3 shrink-0"
                  >
                    {isEnabled ? (
                      <ToggleRight className="w-8 h-8 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>说明：</strong>监控数据从部署后开始积累，历史调用不计入。费用基于 DeepSeek 官方定价（输入 $0.14/M、输出 $0.28/M tokens）估算，仅供参考。关闭开关后该功能 AI 调用立即停止。
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 3: AI 助手配置
// ═══════════════════════════════════════════════════════════════════════════════

function AssistantPanel() {
  const [assistantConfig, setAssistantConfig] = useState<AIAssistantConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ai/assistant/prompts')
      .then(r => r.json())
      .then(result => {
        if (result.success) setAssistantConfig(result.data);
        else toast.error(result.error || '无法加载 AI 助手配置');
      })
      .catch(() => toast.error('网络错误'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    if (!assistantConfig) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/ai/assistant/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assistantConfig),
      });
      const result = await res.json();
      if (result.success) toast.success('AI 助手配置已更新');
      else toast.error(result.error || '无法保存');
    } catch { toast.error('网络错误'); }
    finally { setIsSaving(false); }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置为默认配置吗？')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/assistant/prompts/reset', { method: 'POST' });
      const result = await res.json();
      if (result.success) { setAssistantConfig(result.data); toast.success('已恢复默认值'); }
      else toast.error(result.error || '重置失败');
    } catch { toast.error('网络错误'); }
    finally { setIsLoading(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="px-4 space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
          <RotateCcw className="w-4 h-4 mr-1" /> 重置
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          保存
        </Button>
      </div>

      {assistantConfig && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">核心角色定义</CardTitle>
              <CardDescription className="text-xs">定义 AI 助手的基本角色和职责</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={assistantConfig.segment1} onChange={(e) => setAssistantConfig({ ...assistantConfig, segment1: e.target.value })} className="min-h-[100px] font-mono text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">行为规则</CardTitle>
              <CardDescription className="text-xs">定义 AI 助手的行为准则</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={assistantConfig.segment2} onChange={(e) => setAssistantConfig({ ...assistantConfig, segment2: e.target.value })} className="min-h-[120px] font-mono text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">输出格式要求</CardTitle>
              <CardDescription className="text-xs">定义回答格式和样式</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={assistantConfig.segment3} onChange={(e) => setAssistantConfig({ ...assistantConfig, segment3: e.target.value })} className="min-h-[100px] font-mono text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">示例演示</CardTitle>
              <CardDescription className="text-xs">提供具体的问答示例</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={assistantConfig.segment4} onChange={(e) => setAssistantConfig({ ...assistantConfig, segment4: e.target.value })} className="min-h-[150px] font-mono text-sm" />
            </CardContent>
          </Card>
        </>
      )}

      <ToolsList />
      <ApiKeysStatus />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 4: 企业认证提示词
// ═══════════════════════════════════════════════════════════════════════════════

function CertPanel() {
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ai/prompts')
      .then(r => r.json())
      .then(result => {
        if (result.success) setConfig(result.data);
        else toast.error(result.error || '无法加载配置');
      })
      .catch(() => toast.error('网络错误'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/ai/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      if (result.success) toast.success('AI 配置已更新');
      else toast.error(result.error || '无法保存');
    } catch { toast.error('网络错误'); }
    finally { setIsSaving(false); }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置为默认配置吗？')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/prompts/reset', { method: 'POST' });
      const result = await res.json();
      if (result.success) { setConfig(result.data); toast.success('已恢复默认值'); }
      else toast.error(result.error || '重置失败');
    } catch { toast.error('网络错误'); }
    finally { setIsLoading(false); }
  };

  if (isLoading || !config) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="px-4 space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
          <RotateCcw className="w-4 h-4 mr-1" /> 重置
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          保存
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">System Prompt</CardTitle>
          <CardDescription className="text-xs">定义 AI 的角色和行为方式</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={config.systemPrompt} onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })} className="min-h-[150px] font-mono text-sm" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">User Prompt Template</CardTitle>
          <CardDescription className="text-xs">支持 {`{{name}}`}、{`{{company}}`} 等变量</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={config.userPromptTemplate} onChange={(e) => setConfig({ ...config, userPromptTemplate: e.target.value })} className="min-h-[300px] font-mono text-sm" />
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 5: 参数配置
// ═══════════════════════════════════════════════════════════════════════════════

function ParamsPanel() {
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ai/prompts')
      .then(r => r.json())
      .then(result => {
        if (result.success) setConfig(result.data);
        else toast.error(result.error || '无法加载配置');
      })
      .catch(() => toast.error('网络错误'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/ai/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      if (result.success) toast.success('参数已更新');
      else toast.error(result.error || '无法保存');
    } catch { toast.error('网络错误'); }
    finally { setIsSaving(false); }
  };

  if (isLoading || !config) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="px-4 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          保存
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Temperature</CardTitle>
          <CardDescription className="text-xs">控制 AI 回复的随机性。值越高越随机，值越低越确定。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">当前值：{config.temperature.toFixed(2)}</Label>
            <span className="text-xs text-muted-foreground">
              {config.temperature < 0.3 ? '保守' : config.temperature < 0.7 ? '平衡' : '创造'}
            </span>
          </div>
          <Slider
            value={[config.temperature]}
            onValueChange={([value]) => setConfig({ ...config, temperature: value })}
            min={0} max={2} step={0.1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.0 (确定)</span><span>1.0 (平衡)</span><span>2.0 (随机)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Max Tokens</CardTitle>
          <CardDescription className="text-xs">控制 AI 回复的最大长度。1 token ≈ 0.75 个中文字。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">当前值：{config.maxTokens}</Label>
            <span className="text-xs text-muted-foreground">约 {Math.round(config.maxTokens * 0.75)} 个中文字</span>
          </div>
          <Slider
            value={[config.maxTokens]}
            onValueChange={([value]) => setConfig({ ...config, maxTokens: value })}
            min={100} max={4000} step={100}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>100</span><span>2000</span><span>4000</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 6: 企业报告
// ═══════════════════════════════════════════════════════════════════════════════

function ReportsPanel() {
  return (
    <div className="px-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">AI 企业报告管理</CardTitle>
          <CardDescription className="text-xs">管理企查查报告，使用 DeepSeek AI 自动格式化企业信息</CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyReportManagement />
        </CardContent>
      </Card>
    </div>
  );
}
