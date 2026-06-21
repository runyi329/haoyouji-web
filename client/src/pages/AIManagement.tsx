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
  Settings, AlertCircle, Sparkles, Shield, Users, ChevronDown, ChevronUp
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
  total_cost: number;       // Manus 积分（兼容旧字段）
  manus_credits: number;    // Manus 积分
  manus_cny: number;        // Manus 费用（元）
  ds_total_tokens: number;  // DeepSeek 总 token
  ds_cny: number;           // DeepSeek 费用（元）
  total_cny: number;        // 合计费用（元）
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
  // Manus 系列
  { value: 'manus-1.6-max',              label: 'Manus Max',         desc: '最强能力，复杂任务',          group: 'Manus' },
  { value: 'manus-1.6',                  label: 'Manus 标准',        desc: '平衡性能',                    group: 'Manus' },
  { value: 'manus-1.6-lite',             label: 'Manus 轻量',        desc: '快速省积分',                  group: 'Manus' },
  // DeepSeek 系列
  { value: 'deepseek-v4-flash',          label: 'V4 Flash',          desc: '快速对话，日常问答',          group: 'DeepSeek' },
  { value: 'deepseek-v4-flash-thinking', label: 'V4 Flash 深思',     desc: '中等推理，开启思考链',        group: 'DeepSeek' },
  { value: 'deepseek-v4-pro',            label: 'V4 Pro',            desc: '专业分析，复杂任务',          group: 'DeepSeek' },
  { value: 'deepseek-v4-pro-thinking',   label: 'V4 Pro 深思',       desc: '最强推理，开启思考链',        group: 'DeepSeek' },
  // 智能路由
  { value: 'auto_route',                 label: '智能路由',          desc: '自动分类派发',                group: '路由' },
];

const MODEL_COLOR: Record<string, string> = {
  'manus-1.6-max':              'bg-purple-100 text-purple-700',
  'manus-1.6':                  'bg-blue-100 text-blue-700',
  'manus-1.6-lite':             'bg-green-100 text-green-700',
  'deepseek-v4-flash':          'bg-cyan-100 text-cyan-700',
  'deepseek-v4-flash-thinking': 'bg-teal-100 text-teal-700',
  'deepseek-v4-pro':            'bg-sky-100 text-sky-700',
  'deepseek-v4-pro-thinking':   'bg-indigo-100 text-indigo-700',
  'auto_route':                 'bg-orange-100 text-orange-700',
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

type MainTab = 'wecom' | 'token' | 'route' | 'assistant' | 'cert' | 'params' | 'reports';

const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: 'wecom', label: '企微AI', icon: <Bot className="w-4 h-4" /> },
  { key: 'token', label: 'Token', icon: <Zap className="w-4 h-4" /> },
  { key: 'route', label: 'AI路由', icon: <BarChart2 className="w-4 h-4" /> },
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
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-1 rounded-full border border-gray-300 text-sm text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          刷新
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="pt-3">
        {activeTab === 'wecom' && <WecomPanel />}
        {activeTab === 'token' && <TokenMonitorPanel />}
        {activeTab === 'route' && <RoutePanel />}
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

type WecomTabKey = 'users' | 'workflow' | 'messages' | 'stats' | 'menu' | 'wallet';
const WECOM_TABS: { key: WecomTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'users', label: '用户', icon: <User className="w-3.5 h-3.5" /> },
  { key: 'workflow', label: '工作流', icon: <Zap className="w-3.5 h-3.5" /> },
  { key: 'messages', label: '消息', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: 'stats', label: '统计', icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { key: 'menu', label: '菜单', icon: <Menu className="w-3.5 h-3.5" /> },
  { key: 'wallet', label: '钱包绑定', icon: <Coins className="w-3.5 h-3.5" /> },
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
        {activeTab === 'wallet' && <WalletBindingTab />}
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

interface WecomUser { userid: string; name: string; }

function UsersTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ nickname: string; manus_task_id: string; model_pref: string; system_prompt: string }>({
    nickname: '', manus_task_id: '', model_pref: 'auto_route', system_prompt: ''
  });
  const [manusTasks, setManusTasks] = useState<ManusTask[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ wecom_user_id: '', nickname: '', manus_task_id: '', model_pref: 'auto_route', system_prompt: '' });
  // 批量设置
  const [batchModel, setBatchModel] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false); // 是否开启批量选择模式
  // 未绑定用户
  const [unboundUsers, setUnboundUsers] = useState<WecomUser[]>([]);
  const [showUnbound, setShowUnbound] = useState(false);
  const [loadingUnbound, setLoadingUnbound] = useState(false);
  // Manus任务加载状态
  const [loadingTasks, setLoadingTasks] = useState(false);

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
    setLoadingTasks(true);
    try {
      const res = await fetch('/api/wecom/manus-tasks?limit=100');
      const data = await res.json();
      if (data.ok) setManusTasks(data.tasks || []);
    } catch { /* ignore */ }
    finally { setLoadingTasks(false); }
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

  // 批量设置模型
  const handleBatchSetModel = async () => {
    if (!batchModel) { toast.error('请先选择目标模型'); return; }
    const targetSessions = batchMode && selectedIds.size > 0
      ? sessions.filter(s => selectedIds.has(s.id))
      : sessions.filter(s => s.status !== 'archived');
    if (targetSessions.length === 0) { toast.error('没有可操作的用户'); return; }
    const modelLabel = MODEL_OPTIONS.find(m => m.value === batchModel)?.label;
    const scope = batchMode && selectedIds.size > 0 ? `已勾选的 ${targetSessions.length} 个` : `全部 ${targetSessions.length} 个`;
    if (!confirm(`确认将${scope}用户的模型切换为「${modelLabel}」？`)) return;
    setBatchLoading(true);
    let success = 0, fail = 0;
    for (const s of targetSessions) {
      try {
        const res = await fetch(`/api/wecom/sessions/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_pref: batchModel }),
        });
        const data = await res.json();
        if (data.ok) success++; else fail++;
      } catch { fail++; }
    }
    setBatchLoading(false);
    if (fail === 0) {
      toast.success(`${scope}用户已切换为 ${modelLabel}`);
      if (batchMode) { setSelectedIds(new Set()); setBatchMode(false); }
    } else toast.error(`${success} 成功，${fail} 失败`);
    fetchSessions();
  };

  // 切换用户选中状态
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 全选 / 反选
  const toggleSelectAll = () => {
    const active = sessions.filter(s => s.status !== 'archived');
    if (selectedIds.size === active.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(active.map(s => s.id)));
  };

  // 加载未绑定用户
  const fetchUnboundUsers = async () => {
    setLoadingUnbound(true);
    try {
      const res = await fetch('/api/wecom/wecom-users');
      const data = await res.json();
      const allUsers: WecomUser[] = data.users || [];
      const boundIds = new Set(sessions.map(s => s.wecom_user_id));
      setUnboundUsers(allUsers.filter(u => !boundIds.has(u.userid)));
    } catch { toast.error('加载失败'); }
    finally { setLoadingUnbound(false); }
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
        setAddForm({ wecom_user_id: '', nickname: '', manus_task_id: '', model_pref: 'auto_route', system_prompt: '' });
        fetchSessions();
      } else toast.error(data.error || '绑定失败');
    } catch { toast.error('网络错误'); }
  };

  return (
    <div className="px-4 space-y-3">
      {/* 批量设置模型 */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-700">批量设置模型</div>
          <button
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              batchMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            {batchMode ? `已勾选 ${selectedIds.size} 人` : '勾选部分用户'}
          </button>
        </div>
        {batchMode && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            <button onClick={toggleSelectAll} className="underline">
              {selectedIds.size === sessions.filter(s => s.status !== 'archived').length ? '反选' : '全选'}
            </button>
            <span>共 {sessions.filter(s => s.status !== 'archived').length} 个活跃用户</span>
          </div>
        )}
        <div className="flex gap-2">
          <select
            value={batchModel}
            onChange={e => setBatchModel(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">— 选择目标模型 —</option>
            <optgroup label="—— Manus 系列 ——">
              {MODEL_OPTIONS.filter(m => m.group === 'Manus').map(m => (
                <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
              ))}
            </optgroup>
            <optgroup label="—— DeepSeek 系列 ——">
              {MODEL_OPTIONS.filter(m => m.group === 'DeepSeek').map(m => (
                <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
              ))}
            </optgroup>
            <optgroup label="—— 智能路由 ——">
              {MODEL_OPTIONS.filter(m => m.group === '路由').map(m => (
                <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
              ))}
            </optgroup>
          </select>
          <button
            onClick={handleBatchSetModel}
            disabled={batchLoading || !batchModel || (batchMode && selectedIds.size === 0)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {batchLoading ? '处理中...' : (batchMode && selectedIds.size > 0 ? `应用到 ${selectedIds.size} 人` : '应用到全部')}
          </button>
        </div>
      </div>

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
            <label className="text-xs text-gray-500 mb-1 block">
              Manus 任务（必填）
              {loadingTasks && <span className="ml-1 text-gray-400">加载中...</span>}
            </label>
            {manusTasks.length > 0 ? (
              <SearchSelect
                options={manusTasks}
                value={addForm.manus_task_id}
                onChange={val => setAddForm(f => ({ ...f, manus_task_id: val }))}
                placeholder="选择 Manus 任务..."
                displayKey="title"
                valueKey="id"
              />
            ) : loadingTasks ? (
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">任务列表加载中...</div>
            ) : (
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="手动输入 Manus 任务 ID"
                value={addForm.manus_task_id}
                onChange={e => setAddForm(f => ({ ...f, manus_task_id: e.target.value }))}
              />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">默认模型</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={addForm.model_pref}
              onChange={e => setAddForm(f => ({ ...f, model_pref: e.target.value }))}
            >
              <optgroup label="智能路由">
                {MODEL_OPTIONS.filter(m => m.group === '路由').map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="Manus">
                {MODEL_OPTIONS.filter(m => m.group === 'Manus').map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="DeepSeek">
                {MODEL_OPTIONS.filter(m => m.group === 'DeepSeek').map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            </select>
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
          <div key={session.id} className={`bg-white rounded-xl shadow-sm overflow-hidden relative ${
            batchMode && selectedIds.has(session.id) ? 'ring-2 ring-blue-400' : ''
          }`}>
            {/* 批量模式勾选框 */}
            {batchMode && session.status !== 'archived' && (
              <button
                onClick={() => toggleSelect(session.id)}
                className={`absolute top-3 right-3 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  selectedIds.has(session.id)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300'
                }`}
              >
                {selectedIds.has(session.id) && <Check className="w-3 h-3" />}
              </button>
            )}
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
                    />
                  ) : loadingTasks ? (
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">任务列表加载中...</div>
                  ) : (
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                      value={editForm.manus_task_id || ''}
                      onChange={e => setEditForm(f => ({ ...f, manus_task_id: e.target.value }))}
                      placeholder="手动输入 Manus 任务 ID"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">默认模型</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={editForm.model_pref || 'manus-1.6-max'}
                    onChange={e => setEditForm(f => ({ ...f, model_pref: e.target.value }))}
                  >
                    <optgroup label="智能路由">
                      {MODEL_OPTIONS.filter(m => m.group === '路由').map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Manus">
                      {MODEL_OPTIONS.filter(m => m.group === 'Manus').map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="DeepSeek">
                      {MODEL_OPTIONS.filter(m => m.group === 'DeepSeek').map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  </select>
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

      {/* 未绑定用户区域 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
          onClick={() => {
            setShowUnbound(v => {
              if (!v) fetchUnboundUsers();
              return !v;
            });
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-400" />
            <span>未绑定用户</span>
            {unboundUsers.length > 0 && (
              <span className="bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full font-medium">{unboundUsers.length}</span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showUnbound ? 'rotate-90' : ''}`} />
        </button>
        {showUnbound && (
          <div className="border-t border-gray-100 px-4 pb-4">
            {loadingUnbound ? (
              <div className="text-center py-4 text-xs text-gray-400">加载中...</div>
            ) : unboundUsers.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-400">所有企微成员均已绑定 ✅</div>
            ) : (
              <div className="space-y-2 pt-3">
                <div className="text-xs text-gray-400 mb-2">以下企微成员尚未绑定 Manus 任务，可点「绑定」快速操作：</div>
                {unboundUsers.map(u => (
                  <div key={u.userid} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm text-gray-800 font-medium">{u.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{u.userid}</div>
                    </div>
                    <button
                      onClick={() => {
                        setShowAddForm(true);
                        setAddForm(f => ({ ...f, wecom_user_id: u.userid, nickname: u.name }));
                        fetchDropdownData();
                        setShowUnbound(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200"
                    >
                      绑定
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
  input_tokens?: number;
  output_tokens?: number;
  cache_hit_tokens?: number;
  cny?: number;            // 本条记录换算的人民币
  is_deepseek?: boolean;   // 是否为 DeepSeek 记录
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
  const [manusCredits, setManusCredits] = useState(0);
  const [manusCny, setManusCny] = useState(0);
  const [dsCny, setDsCny] = useState(0);
  const [totalCny, setTotalCny] = useState(0);
  const [detailView, setDetailView] = useState<'user' | 'day' | 'ai'>('user');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/wecom/user-detail?wecom_user_id=${encodeURIComponent(wecomUserId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setSessions(data.sessions || []);
          setRecords(data.records || []);
          setUseMessageCredits(!!data.use_message_credits);
          setManusCredits(data.manus_credits || 0);
          setManusCny(data.manus_cny || 0);
          setDsCny(data.ds_cny || 0);
          setTotalCny(data.total_cny || 0);
        } else toast.error(data.error || '加载失败');
      })
      .catch(() => toast.error('网络错误'))
      .finally(() => setLoading(false));
  }, [wecomUserId]);

  const totalCost = sessions.reduce((s, t) => s + t.total_cost, 0);

  // 按天聚合所有 records
  const dayMap: Record<string, { date: string; manusCredits: number; manusCny: number; dsCny: number; totalCny: number; count: number }> = {};
  records.forEach(r => {
    const day = r.created_at ? r.created_at.slice(0, 10) : '未知';
    if (!dayMap[day]) dayMap[day] = { date: day, manusCredits: 0, manusCny: 0, dsCny: 0, totalCny: 0, count: 0 };
    const cny = r.cny ?? (r.is_deepseek ? 0 : r.credits * 0.037);
    if (r.is_deepseek) { dayMap[day].dsCny += cny; }
    else { dayMap[day].manusCredits += r.credits; dayMap[day].manusCny += cny; }
    dayMap[day].totalCny += cny;
    dayMap[day].count += 1;
  });
  const dayList = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));

  // 按AI聚合
  const manusRecords = records.filter(r => !r.is_deepseek);
  const dsRecords = records.filter(r => r.is_deepseek);
  const manusTotalCny = manusRecords.reduce((s, r) => s + (r.cny ?? r.credits * 0.037), 0);
  const dsTotalCny = dsRecords.reduce((s, r) => s + (r.cny ?? 0), 0);
  const manusTotal = manusRecords.reduce((s, r) => s + r.credits, 0);
  const dsTotal = dsRecords.reduce((s, r) => s + r.credits, 0);

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
          <div className="text-lg font-bold text-green-600">¥{totalCny > 0 ? totalCny.toFixed(2) : (totalCost * 0.037).toFixed(2)}</div>
          <div className="text-xs text-gray-400">
            {dsCny > 0 ? `Manus¥${manusCny.toFixed(2)} + DS¥${dsCny.toFixed(4)}` : `${Math.round(totalCost)}积分`}
          </div>
        </div>
      </div>

      {/* 三维度切换 Tab */}
      <div className="flex border-b border-gray-100 bg-white">
        {([['user','按用户'],['day','按天'],['ai','按AI']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setDetailView(v)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              detailView === v
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-400'
            }`}
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">暂无绑定记录</div>
      ) : detailView === 'user' ? (
        /* ===== 按用户视图（所有消息平铺）===== */
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {records.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">暂无记录</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-400 font-medium border-b border-gray-100">
                <span>用户消息</span>
                <span>消耗 / 元</span>
              </div>
              {[...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((r, i) => {
                const recordCny = r.cny ?? (r.is_deepseek ? 0 : r.credits * 0.037);
                return (
                  <div key={r.id ?? i} className="px-4 py-2.5 flex items-start gap-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs px-1 py-0.5 rounded font-medium ${
                          r.is_deepseek ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                        }`}>{r.is_deepseek ? 'DS' : 'Manus'}</span>
                        <span className="text-xs text-gray-400">{r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}</span>
                      </div>
                      <div className="text-sm text-gray-800 truncate">{r.user_message || '(无内容)'}</div>
                    </div>
                    <div className="flex-shrink-0 text-right ml-2">
                      {r.is_deepseek ? (
                        <>
                          <div className="text-xs text-purple-500">{Math.round(r.credits)} tokens</div>
                          <div className="text-xs font-bold text-green-600">¥{recordCny.toFixed(4)}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                          <div className="text-xs text-green-600">¥{recordCny.toFixed(2)}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : detailView === 'day' ? (
        /* ===== 按天视图 ===== */
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {dayList.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">暂无记录</div>
          ) : dayList.map(d => {
            const isDayExpanded = expandedDay === d.date;
            const dayRecords = records.filter(r => (r.created_at ? r.created_at.slice(0, 10) : '未知') === d.date)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return (
              <div key={d.date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
                  onClick={() => setExpandedDay(isDayExpanded ? null : d.date)}
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{d.date}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.count} 条消息</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-base font-bold text-green-600">¥{d.totalCny.toFixed(4)}</div>
                      <div className="text-xs text-gray-400">
                        {d.manusCny > 0 && <span className="text-blue-500">Manus ¥{d.manusCny.toFixed(2)}</span>}
                        {d.manusCny > 0 && d.dsCny > 0 && <span className="mx-1">+</span>}
                        {d.dsCny > 0 && <span className="text-purple-500">DS ¥{d.dsCny.toFixed(4)}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isDayExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                {isDayExpanded && (
                  <div className="border-t border-gray-50">
                    <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-400 font-medium">
                      <span>用户消息</span>
                      <span>消耗 / 元</span>
                    </div>
                    {dayRecords.map((r, i) => {
                      const recordCny = r.cny ?? (r.is_deepseek ? 0 : r.credits * 0.037);
                      return (
                        <div key={r.id ?? i} className="px-4 py-2.5 flex items-start gap-2 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-xs px-1 py-0.5 rounded font-medium ${
                                r.is_deepseek ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                              }`}>{r.is_deepseek ? 'DS' : 'Manus'}</span>
                              <span className="text-xs text-gray-400">{r.created_at ? r.created_at.slice(11, 16) : ''}</span>
                            </div>
                            <div className="text-sm text-gray-800 truncate">{r.user_message || '(无内容)'}</div>
                          </div>
                          <div className="flex-shrink-0 text-right ml-2">
                            {r.is_deepseek ? (
                              <>
                                <div className="text-xs text-purple-500">{Math.round(r.credits)} tokens</div>
                                <div className="text-xs font-bold text-green-600">¥{recordCny.toFixed(4)}</div>
                              </>
                            ) : (
                              <>
                                <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                                <div className="text-xs text-green-600">¥{recordCny.toFixed(2)}</div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : detailView === 'ai' ? (
        /* ===== 按AI视图 ===== */
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Manus 卡片 */}
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-sm font-semibold text-blue-700">Manus</span>
              </div>
              <div className="text-right">
                <div className="text-base font-bold text-blue-600">¥{manusTotalCny.toFixed(2)}</div>
                <div className="text-xs text-gray-400">{Math.round(manusTotal)} 积分 · {manusRecords.length} 条</div>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {manusRecords.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">暂无记录</div>
              ) : manusRecords.map((r, i) => (
                <div key={r.id ?? i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400">{r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}</div>
                    <div className="text-sm text-gray-700 truncate">{r.user_message || '(无内容)'}</div>
                  </div>
                  <div className="ml-3 text-right flex-shrink-0">
                    <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                    <div className="text-xs text-green-600">¥{(r.cny ?? r.credits * 0.037).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* DeepSeek 卡片 */}
          <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-purple-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-sm font-semibold text-purple-700">DeepSeek</span>
              </div>
              <div className="text-right">
                <div className="text-base font-bold text-purple-600">¥{dsTotalCny.toFixed(4)}</div>
                <div className="text-xs text-gray-400">{Math.round(dsTotal)} tokens · {dsRecords.length} 条</div>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {dsRecords.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">暂无记录</div>
              ) : dsRecords.map((r, i) => (
                <div key={r.id ?? i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400">{r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}</div>
                    <div className="text-sm text-gray-700 truncate">{r.user_message || '(无内容)'}</div>
                  </div>
                  <div className="ml-3 text-right flex-shrink-0">
                    <div className="text-xs text-purple-500">{Math.round(r.credits)} tokens</div>
                    <div className="text-xs text-green-600">¥{(r.cny ?? 0).toFixed(4)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ===== 按消息视图（保留，不再作为Tab入口）===== */
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
                          const recordCny = r.cny ?? (r.is_deepseek ? 0 : r.credits * 0.037);
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
                                  {r.is_deepseek ? (
                                    <>
                                      <div className="text-xs text-purple-500">{Math.round(r.credits)} tokens</div>
                                      <div className="text-xs font-bold text-green-600">¥{recordCny.toFixed(4)}</div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                                      <div className="text-xs text-green-600">¥{recordCny.toFixed(2)}</div>
                                    </>
                                  )}
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
                                  {r.is_deepseek ? (
                                    <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 space-y-1">
                                      <div className="text-xs text-gray-400 font-medium">DeepSeek token 明细</div>
                                      <div className="grid grid-cols-3 gap-1 text-xs">
                                        <div className="text-center">
                                          <div className="text-gray-500">输入(未命中)</div>
                                          <div className="font-semibold text-gray-800">{r.input_tokens ?? 0}</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="text-gray-500">输入(命中)</div>
                                          <div className="font-semibold text-green-600">{r.cache_hit_tokens ?? 0}</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="text-gray-500">输出</div>
                                          <div className="font-semibold text-blue-600">{r.output_tokens ?? 0}</div>
                                        </div>
                                      </div>
                                      <div className="text-xs text-gray-400 text-right">费用 ¥{recordCny.toFixed(6)}</div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                      <span>算力 {r.credits_before ?? '?'} → {r.credits_after ?? '?'}</span>
                                      <span>¥{recordCny.toFixed(2)}</span>
                                    </div>
                                  )}
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
  const [allStats, setAllStats] = useState<UsageStat[]>([]); // 全量用户列表（用于用户多选下拉）
  const [loading, setLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [viewMode, setViewMode] = useState<'user' | 'time' | 'rank' | 'ai'>('user');
  const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);
  const [totalCny, setTotalCny] = useState(0);

  // 三维筛选状态
  type TimeRange = 'all' | 'today' | 'week' | 'month' | 'custom';
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]); // 已选用户ID列表
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [aiModel, setAiModel] = useState<'all' | 'manus' | 'deepseek' | 'ds_flash' | 'ds_pro'>('all');
  const [showAiDropdown, setShowAiDropdown] = useState(false);

  const getDateRange = (range: TimeRange): { start: string; end: string } | null => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'today') { const t = fmt(now); return { start: t, end: t }; }
    if (range === 'week') {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
      return { start: fmt(mon), end: fmt(now) };
    }
    if (range === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: fmt(first), end: fmt(now) };
    }
    if (range === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd };
    return null;
  };

  const buildQuery = (opts?: { range?: TimeRange; cs?: string; ce?: string; users?: string[]; model?: string }) => {
    const r = opts?.range ?? timeRange;
    const cs = opts?.cs ?? customStart;
    const ce = opts?.ce ?? customEnd;
    const users = opts?.users ?? selectedUsers;
    const model = opts?.model ?? aiModel;
    const dr = r === 'custom' ? (cs && ce ? { start: cs, end: ce } : null) : getDateRange(r);
    const p = new URLSearchParams();
    if (dr) { p.set('start_date', dr.start); p.set('end_date', dr.end); }
    if (users.length > 0) p.set('user_ids', users.join(','));
    if (model !== 'all') p.set('ai_model', model);
    return p.toString() ? `?${p.toString()}` : '';
  };

  const fetchStats = useCallback(async (opts?: { range?: TimeRange; cs?: string; ce?: string; users?: string[]; model?: string }) => {
    setLoading(true);
    try {
      const query = buildQuery(opts);
      const res = await fetch(`/api/wecom/stats${query}`);
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats || []);
        setTotalCost(data.total_cost || 0);
        setTotalCny(data.total_cny || 0);
      } else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [timeRange, customStart, customEnd, selectedUsers, aiModel]);

  // 初始加载：同时获取全量用户列表（用于用户多选）
  useEffect(() => {
    fetchStats();
    fetch('/api/wecom/stats').then(r => r.json()).then(d => {
      if (d.ok) setAllStats(d.stats || []);
    });
  }, []);

  const rankStats = [...stats].sort((a, b) => (b.total_cny || 0) - (a.total_cny || 0));

  if (detailUser) {
    return <UserDetailModal wecomUserId={detailUser.id} displayName={detailUser.name} onClose={() => setDetailUser(null)} />;
  }

  return (
    <div className="px-4 space-y-3">
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-blue-200" />
          <span className="text-sm text-blue-100">企微渠道累计费用</span>
        </div>
        <div className="text-3xl font-bold">¥{totalCny.toFixed(2)}</div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-blue-200">Manus {Math.round(totalCost)} 积分 · ¥{(totalCost * 0.037).toFixed(2)}</span>
          <span className="text-xs text-blue-300">│</span>
          <span className="text-xs text-blue-200">DeepSeek ¥{(totalCny - totalCost * 0.037).toFixed(4)}</span>
        </div>
      </div>

      {/* Tab 主视角切换 */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        {(['user', 'time', 'rank', 'ai'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {mode === 'user' ? '按用户' : mode === 'time' ? '按时间' : mode === 'rank' ? '按费用' : '按AI'}
          </button>
        ))}
      </div>

      {/* 三维筛选条 - 三个下拉框并排 */}
      <div className="flex gap-2 relative">

        {/* 时间下拉 */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowTimeDropdown(!showTimeDropdown); setShowUserDropdown(false); setShowAiDropdown(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
              timeRange !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <span>{timeRange === 'all' ? '时间' : timeRange === 'today' ? '今天' : timeRange === 'week' ? '本周' : timeRange === 'month' ? '本月' : '自定义'}</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${showTimeDropdown ? 'rotate-90' : ''}`} />
          </button>
          {showTimeDropdown && (
            <div className="absolute top-10 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-36 py-1">
              {([['all','全部'],['today','今天'],['week','本周'],['month','本月'],['custom','自定义…']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setTimeRange(v);
                    setShowCustomInput(v === 'custom');
                    setShowTimeDropdown(false);
                    if (v !== 'custom') fetchStats({ range: v });
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    timeRange === v ? 'text-blue-600 font-medium' : 'text-gray-700'
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* 用户下拉 */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowUserDropdown(!showUserDropdown); setShowTimeDropdown(false); setShowAiDropdown(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
              selectedUsers.length > 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <span>{selectedUsers.length === 0 ? '用户' : `已选${selectedUsers.length}人`}</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${showUserDropdown ? 'rotate-90' : ''}`} />
          </button>
          {showUserDropdown && (
            <div className="absolute top-10 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-52">
              <div className="px-3 pt-2 pb-1">
                <input
                  type="text"
                  placeholder="搜索用户名…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {allStats
                  .filter(u => !userSearch || (u.nickname || u.wecom_user_id).toLowerCase().includes(userSearch.toLowerCase()))
                  .slice(0, userSearch ? 50 : 10)
                  .map(u => (
                    <label key={u.wecom_user_id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(u.wecom_user_id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selectedUsers, u.wecom_user_id]
                            : selectedUsers.filter(id => id !== u.wecom_user_id);
                          setSelectedUsers(next);
                          fetchStats({ users: next });
                        }}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      <span className="text-sm text-gray-700 truncate">{u.nickname || u.wecom_user_id}</span>
                    </label>
                  ))}
                {!userSearch && allStats.length > 10 && (
                  <div className="px-3 py-1.5 text-sm text-gray-400 text-center">输入名字搜索更多用户</div>
                )}
              </div>
              {selectedUsers.length > 0 && (
                <div className="border-t border-gray-100 px-3 py-2">
                  <button onClick={() => { setSelectedUsers([]); fetchStats({ users: [] }); setShowUserDropdown(false); }}
                    className="text-sm text-red-500">清除已选</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI模型下拉 - 按AI视角时隐藏 */}
        {viewMode !== 'ai' && (<div className="relative flex-1">
          <button
            onClick={() => { setShowAiDropdown(!showAiDropdown); setShowTimeDropdown(false); setShowUserDropdown(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
              aiModel !== 'all' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <span>{aiModel === 'all' ? 'AI模型' : aiModel === 'manus' ? 'Manus' : aiModel === 'deepseek' ? 'DeepSeek' : aiModel === 'ds_flash' ? 'DS Flash' : 'DS Pro'}</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${showAiDropdown ? 'rotate-90' : ''}`} />
          </button>
          {showAiDropdown && (
            <div className="absolute top-10 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-40 py-1">
              {([['all','全部'],['manus','Manus'],['deepseek','DeepSeek'],['ds_flash','DS Flash'],['ds_pro','DS Pro']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setAiModel(v); fetchStats({ model: v }); setShowAiDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    aiModel === v ? 'text-purple-600 font-medium' : 'text-gray-700'
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
        </div>)}
      </div>

      {/* 自定义日期输入展开 */}
      {showCustomInput && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none" />
          <button
            onClick={() => fetchStats({ range: 'custom', cs: customStart, ce: customEnd })}
            disabled={!customStart || !customEnd}
            className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-40"
          >查询</button>
        </div>
      )}

      {/* 已选标签行 */}
      {(timeRange !== 'all' || selectedUsers.length > 0 || aiModel !== 'all') && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {timeRange !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
              {timeRange === 'today' ? '今天' : timeRange === 'week' ? '本周' : timeRange === 'month' ? '本月' : `${customStart}~${customEnd}`}
              <button onClick={() => { setTimeRange('all'); setShowCustomInput(false); fetchStats({ range: 'all' }); }} className="text-blue-400 hover:text-blue-700">×</button>
            </span>
          )}
          {selectedUsers.map(uid => {
            const u = allStats.find(s => s.wecom_user_id === uid);
            return (
              <span key={uid} className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">
                {u?.nickname || uid}
                <button onClick={() => { const next = selectedUsers.filter(id => id !== uid); setSelectedUsers(next); fetchStats({ users: next }); }} className="text-green-400 hover:text-green-700">×</button>
              </span>
            );
          })}
          {aiModel !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">
              {aiModel === 'manus' ? 'Manus' : aiModel === 'deepseek' ? 'DeepSeek' : aiModel === 'ds_flash' ? 'DS Flash' : 'DS Pro'}
              <button onClick={() => { setAiModel('all'); fetchStats({ model: 'all' }); }} className="text-purple-400 hover:text-purple-700">×</button>
            </span>
          )}
          <button
            onClick={() => { setTimeRange('all'); setSelectedUsers([]); setAiModel('all'); setShowCustomInput(false); fetchStats({ range: 'all', users: [], model: 'all' }); }}
            className="text-xs text-gray-400 hover:text-red-500 ml-1"
          >清除全部</button>
        </div>
      )}

      {loading && stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无使用记录</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          {viewMode === 'user' && (
            <table className="w-auto border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">用户</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">开始时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">Manus积分</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">DS tokens</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">合计（元）</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}
                  >
                    <td className="px-3 py-2.5 border-r border-gray-100 whitespace-nowrap">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100 whitespace-nowrap">{formatShortDate(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100 whitespace-nowrap">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-100">
                      <div className="text-sm font-semibold text-blue-600">{Math.round(stat.manus_credits || stat.total_cost)}</div>
                      <div className="text-xs text-gray-400">¥{(stat.manus_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-100">
                      <div className="text-sm font-semibold text-purple-600">{Math.round(stat.ds_total_tokens || 0)}</div>
                      <div className="text-xs text-gray-400">¥{(stat.ds_cny || 0).toFixed(4)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="text-sm font-bold text-green-600">¥{(stat.total_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'time' && (
            <table className="w-auto border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">用户</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">开始时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">累计时间</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">Manus积分</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">合计（元）</th>
                </tr>
              </thead>
              <tbody>
                {[...stats].sort((a, b) => new Date(a.first_bound_at).getTime() - new Date(b.first_bound_at).getTime()).reverse().map((stat, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}
                  >
                    <td className="px-3 py-2.5 border-r border-gray-100 whitespace-nowrap">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100 whitespace-nowrap">{formatShortDate(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-100 whitespace-nowrap">{calcDays(stat.first_bound_at)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-100">
                      <div className="text-sm font-semibold text-blue-600">{Math.round(stat.manus_credits || stat.total_cost)}</div>
                      <div className="text-xs text-gray-400">¥{(stat.manus_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="text-sm font-bold text-green-600">¥{(stat.total_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'rank' && (
            <table className="w-auto border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">排名</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">用户</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">消息数</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">Manus积分</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">DS费用(元)</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">合计（元）</th>
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
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-100">
                      <div className="text-sm font-semibold text-blue-600">{Math.round(stat.manus_credits || stat.total_cost)}</div>
                      <div className="text-xs text-gray-400">¥{(stat.manus_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-purple-600 border-r border-gray-100">¥{(stat.ds_cny || 0).toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="text-sm font-bold text-green-600">¥{(stat.total_cny || stat.total_cost * 0.037).toFixed(2)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 按AI模型视图 */}
      {viewMode === 'ai' && (
        <div className="space-y-3">
          {/* Manus 卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Manus</span>
              <span className="text-sm font-medium text-blue-800">
                {Math.round(stats.reduce((s, r) => s + (r.manus_credits || r.total_cost || 0), 0))} 积分
              </span>
              <span className="ml-auto text-sm font-bold text-blue-700">
                ¥{stats.reduce((s, r) => s + (r.manus_cny || (r.total_cost || 0) * 0.037), 0).toFixed(2)}
              </span>
            </div>
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200">用户</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">消息数</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-20">积分</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 w-20">费用（元）</th>
                </tr>
              </thead>
              <tbody>
                {stats.filter(s => (s.manus_credits || s.total_cost || 0) > 0).map((stat, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}>
                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-600 border-r border-gray-100">{Math.round(stat.manus_credits || stat.total_cost || 0)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-bold text-green-600">¥{(stat.manus_cny || (stat.total_cost || 0) * 0.037).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* DeepSeek 卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border-b border-purple-100">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">DeepSeek</span>
              <span className="text-sm font-medium text-purple-800">
                {Math.round(stats.reduce((s, r) => s + (r.ds_total_tokens || 0), 0))} tokens
              </span>
              <span className="ml-auto text-sm font-bold text-purple-700">
                ¥{stats.reduce((s, r) => s + (r.ds_cny || 0), 0).toFixed(4)}
              </span>
            </div>
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200">用户</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-16">消息数</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 w-20">Tokens</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 w-20">费用（元）</th>
                </tr>
              </thead>
              <tbody>
                {stats.filter(s => (s.ds_total_tokens || 0) > 0).length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-400">暂无 DeepSeek 使用记录</td></tr>
                ) : stats.filter(s => (s.ds_total_tokens || 0) > 0).map((stat, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-purple-50 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}>
                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <div className="font-medium text-gray-900 text-sm">{stat.nickname || stat.wecom_user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{stat.record_count}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-purple-600 border-r border-gray-100">{Math.round(stat.ds_total_tokens || 0)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-bold text-green-600">¥{(stat.ds_cny || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      { name: '我的钱包', type: 'click', key: 'MY_WALLET' },
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

// ─── WalletBindingTab ────────────────────────────────────────────────────────────
interface WalletBinding {
  wecom_user_id: string;
  nickname: string | null;
  binding_id: number | null;
  site_username: string | null;
  site_user_id: number | null;
  bound_by: string | null;
  bound_at: string | null;
}

function WalletBindingTab() {
  const [bindings, setBindings] = useState<WalletBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchBindings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/wallet-bindings');
      const data = await res.json();
      if (data.ok) setBindings(data.bindings || []);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBindings(); }, []);

  const handleBind = async (wecomUserId: string) => {
    if (!inputVal.trim()) { toast.error('请输入网站用户名'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/wecom/wallet-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wecom_user_id: wecomUserId, site_username: inputVal.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || '绑定成功');
        setEditingId(null); setInputVal('');
        fetchBindings();
      } else {
        toast.error(data.error || '绑定失败');
      }
    } catch { toast.error('绑定失败'); }
    finally { setSaving(false); }
  };

  const handleUnbind = async (wecomUserId: string) => {
    if (!confirm('确认解除绑定？')) return;
    try {
      const res = await fetch(`/api/wecom/wallet-bindings/${encodeURIComponent(wecomUserId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { toast.success('已解除绑定'); fetchBindings(); }
      else toast.error(data.error || '解除失败');
    } catch { toast.error('解除失败'); }
  };

  const filtered = bindings.filter(b =>
    !searchText ||
    (b.nickname || '').includes(searchText) ||
    b.wecom_user_id.includes(searchText) ||
    (b.site_username || '').includes(searchText)
  );
  const boundCount = bindings.filter(b => b.binding_id).length;

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-500">
          共 <span className="font-semibold text-gray-800">{bindings.length}</span> 个企微用户，已绑定 <span className="font-semibold text-green-600">{boundCount}</span> 个
        </div>
        <button onClick={fetchBindings} className="text-xs text-blue-500 px-2 py-1 rounded border border-blue-200">刷新</button>
      </div>
      <div className="mb-3">
        <input
          type="text"
          placeholder="搜索企微用户或网站账号..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>
      {loading ? (
        <div className="text-center text-gray-400 text-sm py-8">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => (
            <div key={b.wecom_user_id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-medium text-gray-800 truncate">{b.nickname || b.wecom_user_id}</span>
                    {b.binding_id
                      ? <span className="text-xs bg-green-50 text-green-600 border border-green-200 rounded px-1.5 py-0.5">已绑定</span>
                      : <span className="text-xs bg-gray-50 text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">未绑定</span>
                    }
                  </div>
                  <div className="text-xs text-gray-400 truncate">{b.wecom_user_id}</div>
                  {b.site_username && <div className="text-xs text-blue-600 mt-0.5">💰 {b.site_username}</div>}
                </div>
                <div className="flex-shrink-0 flex gap-1.5">
                  {b.binding_id ? (
                    <>
                      <button onClick={() => { setEditingId(b.wecom_user_id); setInputVal(b.site_username || ''); }}
                        className="text-xs text-blue-500 border border-blue-200 rounded px-2 py-1">修改</button>
                      <button onClick={() => handleUnbind(b.wecom_user_id)}
                        className="text-xs text-red-400 border border-red-200 rounded px-2 py-1">解除</button>
                    </>
                  ) : (
                    <button onClick={() => { setEditingId(b.wecom_user_id); setInputVal(''); }}
                      className="text-xs text-white bg-blue-500 rounded px-2 py-1">绑定</button>
                  )}
                </div>
              </div>
              {editingId === b.wecom_user_id && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">输入网站用户名（username）</div>
                  <div className="flex gap-2">
                    <input
                      type="text" value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBind(b.wecom_user_id)}
                      placeholder="网站用户名" autoFocus
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <button onClick={() => handleBind(b.wecom_user_id)} disabled={saving}
                      className="text-xs text-white bg-blue-500 rounded-lg px-3 py-1.5 disabled:opacity-50">
                      {saving ? '保存...' : '确定'}
                    </button>
                    <button onClick={() => { setEditingId(null); setInputVal(''); }}
                      className="text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1.5">取消</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
const RULE_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Flash（快速、省费）' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek 深思（复杂推理）' },
  { value: 'manus-1.6-lite', label: 'Manus 轻量（快速响应）' },
  { value: 'manus-1.6', label: 'Manus 标准（平衡能力）' },
  { value: 'manus-1.6-max', label: 'Manus Max（最强能力）' },
];

interface CustomRule {
  id: number;
  rule_name: string;
  trigger_intent: string;
  reply_mode: 'template' | 'ai';
  template_text: string;
  ai_model: string;
  ai_system_prompt: string;
  target_type: 'all' | 'selected';
  target_user_ids: string;
  enabled: number;
  trigger_count: number;
  created_at: string;
}

interface WecomUserForRule { wecom_user_id: string; nickname: string; avatar_url?: string; }

function CustomRulesTab() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [wecomUsers2, setWecomUsers2] = useState<WecomUserForRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [form, setForm] = useState({
    rule_name: '',
    trigger_intent: '',
    reply_mode: 'ai' as 'template' | 'ai',
    template_text: '',
    ai_model: 'deepseek-chat',
    ai_system_prompt: '',
    target_type: 'selected' as 'all' | 'selected',
    selected_user_ids: [] as string[],
  });

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/custom-rules');
      const d = await res.json();
      if (d.ok) setRules(d.rules || []);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  };

  const loadUsers2 = async () => {
    try {
      const res = await fetch('/api/wecom/sessions');
      const d = await res.json();
      if (d.ok) {
        // sessions 返回已绑定用户，提取 wecom_user_id 和 nickname
        const users = (d.sessions || []).map((s: any) => ({
          wecom_user_id: s.wecom_user_id,
          nickname: s.nickname || s.wecom_user_id,
          avatar_url: s.avatar_url || '',
        }));
        // 去重
        const seen = new Set<string>();
        setWecomUsers2(users.filter((u: WecomUserForRule) => {
          if (seen.has(u.wecom_user_id)) return false;
          seen.add(u.wecom_user_id);
          return true;
        }));
      }
    } catch {}
  };

  useEffect(() => { loadRules(); loadUsers2(); }, []);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ rule_name: '', trigger_intent: '', reply_mode: 'ai', template_text: '', ai_model: 'deepseek-chat', ai_system_prompt: '', target_type: 'selected', selected_user_ids: [] });
    setShowModal(true);
  };

  const openEdit = (rule: CustomRule) => {
    setEditingRule(rule);
    let ids: string[] = [];
    try { ids = JSON.parse(rule.target_user_ids || '[]'); } catch {}
    setForm({
      rule_name: rule.rule_name,
      trigger_intent: rule.trigger_intent,
      reply_mode: rule.reply_mode,
      template_text: rule.template_text || '',
      ai_model: rule.ai_model || 'deepseek-chat',
      ai_system_prompt: rule.ai_system_prompt || '',
      target_type: rule.target_type,
      selected_user_ids: ids,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.rule_name.trim()) { toast.error('请输入规则名称'); return; }
    if (!form.trigger_intent.trim()) { toast.error('请输入触发意图描述'); return; }
    setSaving(true);
    try {
      const body = {
        rule_name: form.rule_name,
        trigger_intent: form.trigger_intent,
        reply_mode: form.reply_mode,
        template_text: form.template_text,
        ai_model: form.ai_model,
        ai_system_prompt: form.ai_system_prompt,
        target_type: form.target_type,
        target_user_ids: form.target_type === 'all' ? [] : form.selected_user_ids,
        enabled: 1,
      };
      let res;
      if (editingRule) {
        res = await fetch(`/api/wecom/custom-rules/${editingRule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        res = await fetch('/api/wecom/custom-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const d = await res.json();
      if (d.ok) { toast.success('保存成功'); setShowModal(false); loadRules(); }
      else toast.error(d.error || '保存失败');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (rule: CustomRule) => {
    try {
      const res = await fetch(`/api/wecom/custom-rules/${rule.id}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !rule.enabled }) });
      const d = await res.json();
      if (d.ok) { toast.success(rule.enabled ? '已停用' : '已启用'); loadRules(); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/wecom/custom-rules/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) { toast.success('已删除'); setDeleteConfirm(null); loadRules(); }
      else toast.error(d.error || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const toggleUserSelect = (uid: string) => {
    setForm(prev => ({
      ...prev,
      selected_user_ids: prev.selected_user_ids.includes(uid)
        ? prev.selected_user_ids.filter(id => id !== uid)
        : [...prev.selected_user_ids, uid]
    }));
  };

  const filteredRules = rules.filter(r =>
    r.rule_name.includes(search) || r.trigger_intent.includes(search)
  );

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalTriggers = rules.reduce((s, r) => s + (r.trigger_count || 0), 0);

  return (
    <div className="px-4 pb-6 space-y-3">
      {/* 统计栏 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
          <div className="text-lg font-bold text-gray-800">{rules.length}</div>
          <div className="text-xs text-gray-400">规则总数</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
          <div className="text-lg font-bold text-green-600">{enabledCount}</div>
          <div className="text-xs text-gray-400">已启用</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
          <div className="text-lg font-bold text-blue-600">{totalTriggers}</div>
          <div className="text-xs text-gray-400">累计命中</div>
        </div>
      </div>

      {/* 搜索和新建 */}
      <div className="flex gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索规则名称或意图..."
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400"
        />
        <button onClick={openCreate} className="flex items-center gap-1 bg-red-500 text-white text-sm px-3 py-2 rounded-lg">
          <Plus className="w-4 h-4" />新建
        </button>
      </div>

      {/* 规则列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : filteredRules.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <div className="text-sm text-gray-400">暂无专属规则</div>
          <div className="text-xs text-gray-300 mt-1">点击「新建」添加第一条规则</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRules.map(rule => {
            let userIds: string[] = [];
            try { userIds = JSON.parse(rule.target_user_ids || '[]'); } catch {}
            const targetUsers = wecomUsers2.filter(u => userIds.includes(u.wecom_user_id));
            return (
              <div key={rule.id} className={`bg-white rounded-xl border p-3 ${rule.enabled ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <span className="text-sm font-medium text-gray-800 truncate">{rule.rule_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${rule.reply_mode === 'template' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                        {rule.reply_mode === 'template' ? '固定模板' : 'AI回复'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 line-clamp-2">{rule.trigger_intent}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {rule.target_type === 'all' ? (
                        <span className="text-xs text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">全部用户</span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {targetUsers.length > 0
                            ? targetUsers.slice(0, 3).map(u => u.nickname).join('、') + (targetUsers.length > 3 ? `等${targetUsers.length}人` : '')
                            : `${userIds.length}个用户`
                          }
                        </span>
                      )}
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-400">命中 {rule.trigger_count} 次</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(rule)} className="text-xs text-blue-500 border border-blue-200 rounded px-2 py-1">编辑</button>
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`text-xs border rounded px-2 py-1 ${rule.enabled ? 'text-gray-500 border-gray-200' : 'text-green-600 border-green-200'}`}
                    >
                      {rule.enabled ? '停用' : '启用'}
                    </button>
                    {deleteConfirm === rule.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(rule.id)} className="text-xs text-white bg-red-500 rounded px-1.5 py-1">确删</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-1">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(rule.id)} className="text-xs text-red-400 border border-red-100 rounded px-2 py-1">删除</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-gray-800">{editingRule ? '编辑规则' : '新建专属规则'}</span>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-4 py-4 space-y-4">

              {/* 规则名称 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">规则名称 <span className="text-red-400">*</span></label>
                <input
                  value={form.rule_name}
                  onChange={e => setForm(p => ({ ...p, rule_name: e.target.value }))}
                  placeholder="如：世界杯赔率查询"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400"
                />
              </div>

              {/* 触发意图 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">触发意图描述 <span className="text-red-400">*</span></label>
                <div className="text-xs text-gray-400 mb-1">用自然语言描述什么情况下触发，AI 会判断用户消息是否匹配</div>
                <Textarea
                  value={form.trigger_intent}
                  onChange={e => setForm(p => ({ ...p, trigger_intent: e.target.value }))}
                  placeholder="如：用户在询问某支球队的赔率、比赛信息或赌局分析"
                  className="text-sm min-h-[70px] resize-none"
                />
              </div>

              {/* 回复模式切换 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">回复模式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, reply_mode: 'template' }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.reply_mode === 'template'
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    固定模板回复
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, reply_mode: 'ai' }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.reply_mode === 'ai'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    专属 AI 回复
                  </button>
                </div>
              </div>

              {/* 固定模板内容 */}
              {form.reply_mode === 'template' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">回复内容</label>
                  <Textarea
                    value={form.template_text}
                    onChange={e => setForm(p => ({ ...p, template_text: e.target.value }))}
                    placeholder="输入固定回复内容，支持 \n 换行"
                    className="text-sm min-h-[100px] resize-none font-mono"
                  />
                </div>
              )}

              {/* 专属 AI 配置 */}
              {form.reply_mode === 'ai' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">指定模型</label>
                    <div className="space-y-1.5">
                      {RULE_MODELS.map(m => (
                        <button
                          key={m.value}
                          onClick={() => setForm(p => ({ ...p, ai_model: m.value }))}
                          className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-all ${
                            form.ai_model === m.value
                              ? 'border-blue-400 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">专属 System Prompt</label>
                    <div className="text-xs text-gray-400 mb-1">告诉 AI 用什么格式、查什么内容回答</div>
                    <Textarea
                      value={form.ai_system_prompt}
                      onChange={e => setForm(p => ({ ...p, ai_system_prompt: e.target.value }))}
                      placeholder="如：你是一个体育赔率分析师，当用户提到任何球队名称时，请搜索该球队世界杯下一场比赛的最新赔率..."
                      className="text-sm min-h-[120px] resize-none"
                    />
                  </div>
                </>
              )}

              {/* 适用用户 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">适用用户</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setForm(p => ({ ...p, target_type: 'selected' }))}
                    className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.target_type === 'selected'
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    指定用户
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, target_type: 'all' }))}
                    className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.target_type === 'all'
                        ? 'border-purple-400 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    全部用户
                  </button>
                </div>
                {form.target_type === 'selected' && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {wecomUsers2.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-4">暂无企微用户</div>
                    ) : wecomUsers2.map(u => (
                      <div
                        key={u.wecom_user_id}
                        onClick={() => toggleUserSelect(u.wecom_user_id)}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                          form.selected_user_ids.includes(u.wecom_user_id) ? 'bg-red-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          form.selected_user_ids.includes(u.wecom_user_id) ? 'bg-red-500 border-red-500' : 'border-gray-300'
                        }`}>
                          {form.selected_user_ids.includes(u.wecom_user_id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="w-7 h-7 rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <span className="text-sm text-gray-700">{u.nickname || u.wecom_user_id}</span>
                      </div>
                    ))}
                  </div>
                )}
                {form.target_type === 'selected' && form.selected_user_ids.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">已选 {form.selected_user_ids.length} 个用户</div>
                )}
              </div>

              {/* 保存按钮 */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-red-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? '保存中...' : '保存规则'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuTab() {
  const [menu, setMenu] = useState<MenuItemType[]>(DEFAULT_WECOM_MENU);
  const [draft, setDraft] = useState<MenuItemType[]>(DEFAULT_WECOM_MENU);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  // 进入时从后端加载已保存的菜单
  useEffect(() => {
    fetch('/api/wecom/menu')
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.menu) {
          setMenu(data.menu);
          setDraft(JSON.parse(JSON.stringify(data.menu)));
        }
      })
      .catch(() => {});
  }, []);

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

  // 切换一级菜单模式：有子菜单 <-> 直接触发
  const handleToggleMode = (i: number) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    if (m[i].sub_button && m[i].sub_button!.length > 0) {
      // 有子菜单 → 切换为直接触发（删除所有子菜单，设置 key）
      delete m[i].sub_button;
      m[i].key = '';
    } else {
      // 直接触发 → 切换为有子菜单（清除 key，添加一个空子菜单）
      m[i].key = '';
      m[i].sub_button = [{ name: '', type: 'click', key: '' }];
    }
    setDraft(m);
  };

  // 修改一级菜单的 key（直接触发模式）
  const handleTopKeyChange = (i: number, val: string) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    m[i].key = val;
    setDraft(m);
  };

  const handleAddSub = (i: number) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    if (!m[i].sub_button) m[i].sub_button = [];
    if ((m[i].sub_button!.length) >= 5) { toast.error('每个一级菜单最多5个子菜单'); return; }
    m[i].sub_button!.push({ name: '', type: 'click', key: '' });
    setDraft(m);
  };

  const handleDeleteSub = (i: number, j: number) => {
    const m = JSON.parse(JSON.stringify(draft)) as MenuItemType[];
    m[i].sub_button!.splice(j, 1);
    // 删完后自动切换为直接触发模式
    if (m[i].sub_button!.length === 0) {
      delete m[i].sub_button;
      m[i].key = '';
    }
    setDraft(m);
  };

  const handleSave = async () => {
    // 校验：所有子菜单 name 和 key 不能为空
    for (const item of draft) {
      if (!item.name.trim()) { toast.error('一级菜单名称不能为空'); return; }
      for (const sub of (item.sub_button || [])) {
        if (!sub.name.trim()) { toast.error('子菜单名称不能为空'); return; }
        if (!sub.key?.trim()) { toast.error('子菜单 Key 不能为空'); return; }
      }
    }
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
  const [keyRefOpen, setKeyRefOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const KEY_REF = [
    { key: 'MY_WALLET',       label: '我的钱包',   desc: '查询网站钱包余额' },
    { key: 'CREDITS_QUERY',   label: '查积分',    desc: '查 AI 积分消耗' },
    { key: 'NEW_TASK',        label: '新对话',    desc: '开启全新 AI 对话' },
    { key: 'TASK_STATUS',     label: '任务状态',   desc: '查当前任务信息' },
    { key: 'MODEL_MAX',       label: 'Max 模式',   desc: '切换最强模型' },
    { key: 'MODEL_NORMAL',    label: '标准模式',   desc: '切换标准模型' },
    { key: 'MODEL_LITE',      label: '轻量模式',   desc: '切换轻量模型' },
    { key: 'MODEL_DS_FLASH',  label: 'DeepSeek',   desc: '切换 DeepSeek 模型' },
    { key: 'MODEL_STATUS',    label: '当前模型',   desc: '查询当前使用模型' },
    { key: 'AI_EMPLOYEE',     label: 'AI 员工',   desc: '切换智能路由模式' },
    { key: 'HELP',            label: '使用帮助',   desc: '显示帮助说明' },
    { key: 'FEEDBACK',        label: '意见反馈',   desc: '反馈入口' },
  ];
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };
  return (
    <div className="px-4 space-y-3">
      {/* Key 对照表 */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 overflow-hidden">
        <button
          className="w-full px-3 py-2.5 flex items-center justify-between"
          onClick={() => setKeyRefOpen(v => !v)}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs">📋</span>
            <span className="text-xs font-medium text-blue-800">Key 对照表（点击可一键复制）</span>
          </div>
          <span className="text-xs text-blue-400">{keyRefOpen ? '收起' : '展开'}</span>
        </button>
        {keyRefOpen && (
          <div className="border-t border-blue-100">
            {KEY_REF.map(item => (
              <div key={item.key} className="flex items-center justify-between px-3 py-2 border-b border-blue-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-700 font-medium">{item.label}</span>
                  <span className="text-xs text-gray-400 ml-1.5">{item.desc}</span>
                </div>
                <button
                  onClick={() => handleCopyKey(item.key)}
                  className={`flex-shrink-0 ml-2 text-xs px-2 py-0.5 rounded border transition-all ${
                    copiedKey === item.key
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-blue-600 border-blue-200'
                  }`}
                >
                  {copiedKey === item.key ? '✓ 已复制' : item.key}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-amber-800 mb-0.5">菜单配置</div>
            <div className="text-xs text-amber-700">
              {editing ? '编辑模式 — 可增删子菜单，修改完成后点击推送' : '企业微信最多3个一级菜单，每个下最多5个子菜单'}
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
              <span className="text-sm font-medium text-gray-900">{item.name || '(未命名)'}</span>
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

              {/* 模式切换区域 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-600">
                    {item.sub_button && item.sub_button.length > 0 ? '子菜单模式' : '直接触发模式'}
                  </div>
                  {editing && (
                    <div className="flex items-center gap-2">
                      {item.sub_button && item.sub_button.length > 0 && (
                        <button
                          onClick={() => handleAddSub(i)}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium"
                        >
                          <Plus className="w-3 h-3" /> 添加子菜单
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleMode(i)}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                      >
                        {item.sub_button && item.sub_button.length > 0 ? '改为直接触发' : '添加子菜单'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 直接触发模式：显示 Key 输入框 */}
                {(!item.sub_button || item.sub_button.length === 0) && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <label className="text-xs text-blue-700 mb-1 block">Key（点击按鈕触发的指令）</label>
                    <input
                      className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
                        editing ? 'border-blue-200 bg-white' : 'border-transparent bg-blue-100 text-blue-800'
                      }`}
                      placeholder="如：AI_EMPLOYEE"
                      value={item.key || ''}
                      onChange={e => editing && handleTopKeyChange(i, e.target.value)}
                      readOnly={!editing}
                    />
                    <div className="text-xs text-blue-500 mt-1">用户点击此菜单时，服务器会收到此 Key</div>
                  </div>
                )}

                {/* 子菜单列表 */}
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
                      {editing && (
                        <button
                          onClick={() => handleDeleteSub(i, j)}
                          className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-500 rounded-lg flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
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
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600"
        >
          刷新
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

// ═══════════════════════════════════════════════════════════════════════════════
// Panel 7: AI 路由
// ═══════════════════════════════════════════════════════════════════════════════

const ROUTE_MODEL_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  'deepseek-flash': { label: 'DeepSeek 快速', color: 'bg-yellow-100 text-yellow-700', emoji: '⚡' },
  'deepseek-reasoner': { label: 'DeepSeek 深思', color: 'bg-orange-100 text-orange-700', emoji: '🧠' },
  'manus-max': { label: 'Manus Max', color: 'bg-purple-100 text-purple-700', emoji: '🔴' },
  'manus-standard': { label: 'Manus 标准', color: 'bg-blue-100 text-blue-700', emoji: '🟡' },
  'manus-lite': { label: 'Manus 轻量', color: 'bg-green-100 text-green-700', emoji: '🟢' },
};

function RoutePanel() {
  const [routeSubTab, setRouteSubTab] = useState<'config' | 'rules'>('config');
  const [routeEnabled, setRouteEnabled] = useState(false);
  const [classifierModel, setClassifierModel] = useState('deepseek-chat');
  const [fallback, setFallback] = useState('deepseek-flash');
  const [classifyPrompt, setClassifyPrompt] = useState('');
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('已切换到 AI 员工模式\n\n我会自动判断你的问题，选择最合适的 AI 来回答。\n直接发消息开始吧！');
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [waitingMsg, setWaitingMsg] = useState('收到，AI 正在思考中，请稍候...');
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [savingWaiting, setSavingWaiting] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [editingSystemPrompt, setEditingSystemPrompt] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [days, setDays] = useState(7);

  // 菜单回复模板状态
  // menuKeys: [{key, name, desc, vars}]
  const [menuKeys, setMenuKeys] = useState<{key:string;name:string;desc:string;vars:string[]}[]>([]);
  // 模板内容：{ [key]: string }
  const [menuReplies, setMenuReplies] = useState<Record<string,string>>({});
  // 编辑状态：{ [key]: boolean }
  const [editingReplies, setEditingReplies] = useState<Record<string,boolean>>({});
  const [savingReplies, setSavingReplies] = useState<Record<string,boolean>>({});

  useEffect(() => {
    fetch('/api/wecom/route-config')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.config) {
          setRouteEnabled(d.config.route_enabled === 'true');
          setClassifierModel(d.config.classifier_model || 'deepseek-chat');
          setFallback(d.config.fallback_model || 'deepseek-flash');
          setClassifyPrompt(d.config.classify_prompt || '');
          if (d.config.employee_welcome) setWelcomeMsg(d.config.employee_welcome);
          if (d.config.waiting_msg) setWaitingMsg(d.config.waiting_msg);
          if (d.config.system_prompt !== undefined) setSystemPrompt(d.config.system_prompt || '');
          // 加载菜单回复模板
          const replies: Record<string,string> = {};
          Object.keys(d.config).forEach(k => {
            if (k.startsWith('menu_reply_')) {
              const eventKey = k.replace('menu_reply_', '');
              replies[eventKey] = d.config[k];
            }
          });
          setMenuReplies(replies);
        }
      })
      .catch(() => {});
    // 加载已保存菜单，提取所有 Key
    fetch('/api/wecom/menu')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.menu) {
          // 内置 Key 对应的变量说明
          const VAR_HINTS: Record<string,{name:string;desc:string;vars:string[]}> = {
            MY_WALLET:     { name: '我的钱包', desc: '查询钱包余额时的回复', vars: ['{username}=账号', '{balance}=余额(元)', '{time}=查询时间'] },
            CREDITS_QUERY: { name: '查积分', desc: '查积分前的提示语', vars: [] },
            NEW_TASK:      { name: '新对话', desc: '开启新对话时的回复', vars: [] },
            TASK_STATUS:   { name: '任务状态', desc: '查询任务状态时的回复', vars: ['{task_id}=任务ID', '{created_at}=创建时间', '{model}=当前模型'] },
            MODEL_MAX:     { name: 'Max 模式', desc: '切换模型时的回复', vars: ['{model}=模型名称', '{emoji}=模型图标'] },
            MODEL_NORMAL:  { name: '标准模式', desc: '切换模型时的回复', vars: ['{model}=模型名称', '{emoji}=模型图标'] },
            MODEL_LITE:    { name: '轻量模式', desc: '切换模型时的回复', vars: ['{model}=模型名称', '{emoji}=模型图标'] },
            MODEL_DS_FLASH:{ name: 'DeepSeek', desc: '切换模型时的回复', vars: ['{model}=模型名称', '{emoji}=模型图标'] },
            MODEL_STATUS:  { name: '当前模型', desc: '查询当前模型时的回复', vars: ['{model}=模型名称'] },
            AI_EMPLOYEE:   { name: 'AI 员工', desc: '切换 AI 员工模式时的回复', vars: [] },
            HELP:          { name: '使用帮助', desc: '点击帮助时的回复', vars: [] },
            FEEDBACK:      { name: '意见反馈', desc: '点击反馈时的回复', vars: [] },
          };
          // 从菜单配置中提取所有 Key
          const keys: {key:string;name:string;desc:string;vars:string[]}[] = [];
          const seen = new Set<string>();
          const extractKeys = (items: any[]) => {
            for (const item of items) {
              if (item.key && !seen.has(item.key)) {
                seen.add(item.key);
                const hint = VAR_HINTS[item.key] || { name: item.name || item.key, desc: '菜单回复', vars: [] };
                keys.push({ key: item.key, name: hint.name || item.name || item.key, desc: hint.desc, vars: hint.vars });
              }
              if (item.sub_button) extractKeys(item.sub_button);
            }
          };
          extractKeys(d.menu);
          setMenuKeys(keys);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    fetch(`/api/wecom/route-stats?days=${days}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setStats(d); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [days]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/wecom/route-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            route_enabled: String(routeEnabled),
            classifier_model: classifierModel,
            fallback_model: fallback,
            classify_prompt: classifyPrompt,
          }
        })
      });
      const d = await res.json();
      if (d.ok) {
        toast.success('路由配置已保存');
        setEditingConfig(false);
      } else {
        toast.error(d.error || '保存失败');
      }
    } catch {
      toast.error('保存失败，请重试');
    } finally {
      setSavingConfig(false);
    }
  };

  const todayTotal = stats?.today?.reduce((s: number, r: any) => s + Number(r.msg_count), 0) || 0;
  const todayByModel = stats?.today || [];

  const trendDates: string[] = [];
  const trendByModel: Record<string, number[]> = {};
  if (stats?.trend) {
    const dateSet = new Set<string>();
    stats.trend.forEach((r: any) => dateSet.add(r.date));
    const sortedDates = Array.from(dateSet).sort();
    sortedDates.forEach(d => trendDates.push(d.slice(5)));
    stats.trend.forEach((r: any) => {
      const key = r.routed_to || 'unknown';
      if (!trendByModel[key]) trendByModel[key] = new Array(sortedDates.length).fill(0);
      const idx = sortedDates.indexOf(r.date);
      if (idx >= 0) trendByModel[key][idx] = Number(r.msg_count);
    });
  }

  const modelColors: Record<string, string> = {
    'deepseek-flash': '#f59e0b',
    'deepseek-reasoner': '#f97316',
    'manus-max': '#8b5cf6',
    'manus-standard': '#3b82f6',
    'manus-lite': '#22c55e',
  };

  return (
    <div className="space-y-0">
      {/* 子Tab切换栏 */}
      <div className="px-4 pb-3">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setRouteSubTab('config')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-all ${
              routeSubTab === 'config' ? 'bg-white text-red-600 font-medium shadow-sm' : 'text-gray-500'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />路由配置
          </button>
          <button
            onClick={() => setRouteSubTab('rules')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-all ${
              routeSubTab === 'rules' ? 'bg-white text-red-600 font-medium shadow-sm' : 'text-gray-500'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />专属规则
          </button>
        </div>
      </div>

      {routeSubTab === 'rules' && <CustomRulesTab />}

      {routeSubTab === 'config' && <div className="px-4 space-y-4">
      {/* 路由配置卡片 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">AI 智能路由</CardTitle>
            {!editingConfig ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingConfig(true)}>
                <Edit2 className="w-3 h-3 mr-1" />编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingConfig(false)}>取消</Button>
                <Button size="sm" className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white" onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  保存
                </Button>
              </div>
            )}
          </div>
          <CardDescription className="text-xs">开启后系统自动判断每条消息派给哪个模型，用户无需手动选择</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <div className="text-sm font-medium">智能路由开关</div>
              <div className="text-xs text-gray-500">关闭后用户手动选择模型</div>
            </div>
            <button
              onClick={() => editingConfig && setRouteEnabled(!routeEnabled)}
              className={`transition-opacity ${!editingConfig ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {routeEnabled
                ? <ToggleRight className="w-8 h-8 text-blue-500" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">前置分类模型</div>
              <div className="text-xs text-gray-500">判断消息应派给谁，建议轻量级</div>
            </div>
            <select
              value={classifierModel}
              onChange={e => editingConfig && setClassifierModel(e.target.value)}
              disabled={!editingConfig}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white disabled:bg-gray-50"
            >
              <optgroup label="DeepSeek">
                <option value="deepseek-chat">V4 Flash（推荐）</option>
                <option value="deepseek-v4-pro">V4 Pro</option>
              </optgroup>
              <optgroup label="Manus">
                <option value="manus-1.6-lite">Manus 轻量（推荐）</option>
                <option value="manus-1.6">Manus 标准</option>
                <option value="manus-1.6-max">Manus Max</option>
              </optgroup>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">兜底模型</div>
              <div className="text-xs text-gray-500">分类失败时使用</div>
            </div>
            <select
              value={fallback}
              onChange={e => editingConfig && setFallback(e.target.value)}
              disabled={!editingConfig}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white disabled:bg-gray-50"
            >
              <optgroup label="DeepSeek">
                <option value="deepseek-chat">V4 Flash</option>
                <option value="deepseek-v4-flash-thinking">V4 Flash 深思</option>
                <option value="deepseek-v4-pro">V4 Pro</option>
                <option value="deepseek-v4-pro-thinking">V4 Pro 深思</option>
              </optgroup>
              <optgroup label="Manus">
                <option value="manus-1.6-lite">Manus 轻量</option>
                <option value="manus-1.6">Manus 标准</option>
                <option value="manus-1.6-max">Manus Max</option>
              </optgroup>
            </select>
          </div>
          {editingConfig && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">分类 Prompt（留空使用默认规则）</Label>
              <Textarea
                value={classifyPrompt}
                onChange={e => setClassifyPrompt(e.target.value)}
                placeholder="留空使用内置默认分类规则"
                className="text-xs min-h-[80px] resize-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI员工欢迎语配置 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">AI 员工欢迎语</CardTitle>
            {!editingWelcome ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingWelcome(true)}>
                <Edit2 className="w-3 h-3 mr-1" />编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingWelcome(false)}>取消</Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                  disabled={savingWelcome}
                  onClick={async () => {
                    setSavingWelcome(true);
                    try {
                      const res = await fetch('/api/wecom/route-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config: { employee_welcome: welcomeMsg } })
                      });
                      const d = await res.json();
                      if (d.ok) { toast.success('欢迎语已保存'); setEditingWelcome(false); }
                      else toast.error(d.error || '保存失败');
                    } catch { toast.error('保存失败，请重试'); }
                    finally { setSavingWelcome(false); }
                  }}
                >
                  {savingWelcome ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  保存
                </Button>
              </div>
            )}
          </div>
          <CardDescription className="text-xs">用户点击"AI员工"菜单时收到的提示语，支持换行（\n）</CardDescription>
        </CardHeader>
        <CardContent>
          {editingWelcome ? (
            <Textarea
              value={welcomeMsg}
              onChange={e => setWelcomeMsg(e.target.value)}
              placeholder="输入欢迎语，用 \n 表示换行"
              className="text-xs min-h-[100px] resize-none font-mono"
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono border border-gray-100">
              {welcomeMsg || '（未设置）'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 等待提示语配置 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">等待提示语</CardTitle>
            {!editingWaiting ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingWaiting(true)}>
                <Edit2 className="w-3 h-3 mr-1" />编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingWaiting(false)}>取消</Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                  disabled={savingWaiting}
                  onClick={async () => {
                    setSavingWaiting(true);
                    try {
                      const res = await fetch('/api/wecom/route-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config: { waiting_msg: waitingMsg } })
                      });
                      const d = await res.json();
                      if (d.ok) { toast.success('等待提示语已保存'); setEditingWaiting(false); }
                      else toast.error(d.error || '保存失败');
                    } catch { toast.error('保存失败，请重试'); }
                    finally { setSavingWaiting(false); }
                  }}
                >
                  {savingWaiting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  保存
                </Button>
              </div>
            )}
          </div>
          <CardDescription className="text-xs">用户发消息后、AI 回复前显示的提示语，不暴露模型名称</CardDescription>
        </CardHeader>
        <CardContent>
          {editingWaiting ? (
            <input
              type="text"
              value={waitingMsg}
              onChange={e => setWaitingMsg(e.target.value)}
              placeholder="例如：收到，AI 正在思考中，请稍候..."
              className="w-full text-xs border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 border border-gray-100">
              {waitingMsg || '（未设置）'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 全局 System Prompt */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">全局 AI 指令（System Prompt）</CardTitle>
            {!editingSystemPrompt ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingSystemPrompt(true)}>
                <Edit2 className="w-3 h-3 mr-1" />编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingSystemPrompt(false)}>取消</Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                  disabled={savingSystemPrompt}
                  onClick={async () => {
                    setSavingSystemPrompt(true);
                    try {
                      const res = await fetch('/api/wecom/route-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config: { system_prompt: systemPrompt } })
                      });
                      const d = await res.json();
                      if (d.ok) { toast.success('AI 指令已保存'); setEditingSystemPrompt(false); }
                      else toast.error(d.error || '保存失败');
                    } catch { toast.error('保存失败，请重试'); }
                    finally { setSavingSystemPrompt(false); }
                  }}
                >
                  {savingSystemPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  保存
                </Button>
              </div>
            )}
          </div>
          <CardDescription className="text-xs">对所有用户生效的 AI 行为约束，例如禁止透露模型名称、限定回答范围等。留空则不限制。</CardDescription>
        </CardHeader>
        <CardContent>
          {editingSystemPrompt ? (
            <Textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="例如：你是一名专业助手，请不要透露你使用的是哪个大模型，也不要提及 DeepSeek、GPT、Manus 等品牌名称。"
              className="text-xs min-h-[120px] resize-none"
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap border border-gray-100 min-h-[60px]">
              {systemPrompt || '（未设置，AI 不受额外约束）'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 菜单回复模板 */}
      {menuKeys.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1 h-4 bg-red-500 rounded-full" />
            <span className="text-sm font-medium text-gray-800">菜单自动回复模板</span>
            <span className="text-xs text-gray-400">用户点击菜单时自动发送的文字，空则用默认回复</span>
          </div>
          {menuKeys.map(item => (
            <Card key={item.key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{item.name}</CardTitle>
                    <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                  </div>
                  {!editingReplies[item.key] ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingReplies(v => ({ ...v, [item.key]: true }))}>
                      <Edit2 className="w-3 h-3 mr-1" />编辑
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingReplies(v => ({ ...v, [item.key]: false }))}>取消</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                        disabled={savingReplies[item.key]}
                        onClick={async () => {
                          setSavingReplies(v => ({ ...v, [item.key]: true }));
                          try {
                            const res = await fetch('/api/wecom/route-config', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ config: { [`menu_reply_${item.key}`]: menuReplies[item.key] || '' } })
                            });
                            const d = await res.json();
                            if (d.ok) { toast.success(`「${item.name}」回复模板已保存`); setEditingReplies(v => ({ ...v, [item.key]: false })); }
                            else toast.error(d.error || '保存失败');
                          } catch { toast.error('保存失败，请重试'); }
                          finally { setSavingReplies(v => ({ ...v, [item.key]: false })); }
                        }}
                      >
                        {savingReplies[item.key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        保存
                      </Button>
                    </div>
                  )}
                </div>
                {item.vars.length > 0 && editingReplies[item.key] && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-xs text-gray-400 self-center">点击插入：</span>
                    {item.vars.map(v => {
                      // 提取变量名，如 "{username}=账号" 取 "{username}"
                      const varToken = v.split('=')[0];
                      return (
                        <button
                          key={v}
                          type="button"
                          className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 font-mono active:bg-blue-100 cursor-pointer hover:bg-blue-100 transition-colors"
                          onClick={() => {
                            const ta = document.getElementById(`menu-reply-ta-${item.key}`) as HTMLTextAreaElement | null;
                            if (!ta) {
                              setMenuReplies(prev => ({ ...prev, [item.key]: (prev[item.key] || '') + varToken }));
                              return;
                            }
                            const start = ta.selectionStart ?? (menuReplies[item.key] || '').length;
                            const end = ta.selectionEnd ?? start;
                            const cur = menuReplies[item.key] || '';
                            const next = cur.slice(0, start) + varToken + cur.slice(end);
                            setMenuReplies(prev => ({ ...prev, [item.key]: next }));
                            // 延迟恢复光标位置
                            setTimeout(() => {
                              ta.focus();
                              const pos = start + varToken.length;
                              ta.setSelectionRange(pos, pos);
                            }, 0);
                          }}
                        >
                          {varToken} <span className="text-gray-400 font-sans">{v.split('=')[1]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {item.vars.length > 0 && !editingReplies[item.key] && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.vars.map(v => (
                      <span key={v} className="text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 font-mono">{v}</span>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {editingReplies[item.key] ? (
                  <Textarea
                    id={`menu-reply-ta-${item.key}`}
                    value={menuReplies[item.key] || ''}
                    onChange={e => setMenuReplies(v => ({ ...v, [item.key]: e.target.value }))}
                    placeholder={`输入回复内容，空则用默认回复。支持\\n换行${item.vars.length > 0 ? '，点击上方变量可插入' : ''}`}
                    className="text-xs min-h-[80px] resize-none font-mono"
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono border border-gray-100 min-h-[40px]">
                    {menuReplies[item.key] || <span className="text-gray-400">（未设置，使用默认回复）</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 今日统计 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">今日消息分发</CardTitle>
            <span className="text-xs text-gray-500">共 {todayTotal} 条</span>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : todayTotal === 0 ? (
            <div className="text-center text-xs text-gray-400 py-4">今日暂无路由记录</div>
          ) : (
            <div className="space-y-2">
              {todayByModel.map((row: any) => {
                const modelInfo = ROUTE_MODEL_LABELS[row.routed_to] || { label: row.routed_to, color: 'bg-gray-100 text-gray-600', emoji: '?' };
                const pct = todayTotal > 0 ? Math.round(Number(row.msg_count) / todayTotal * 100) : 0;
                return (
                  <div key={row.routed_to} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modelInfo.color}`}>
                        {modelInfo.emoji} {modelInfo.label}
                      </span>
                      <span className="text-xs text-gray-600 font-medium">{row.msg_count} 条 ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: modelColors[row.routed_to] || '#9ca3af' }}
                      />
                    </div>
                    {Number(row.total_reply_tokens) > 0 && (
                      <div className="text-xs text-gray-400">回复 {Number(row.total_reply_tokens).toLocaleString()} tokens · 均耗时 {Math.round(Number(row.avg_latency) / 1000)}s</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 历史趋势 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">历史趋势</CardTitle>
            <div className="flex gap-1">
              {[7, 14, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                    days === d ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {d}天
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : trendDates.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-4">暂无历史数据</div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${Math.max(trendDates.length * 40, 280)}px` }}>
                <div className="flex items-end gap-1 h-24">
                  {trendDates.map((date, i) => {
                    const total = Object.values(trendByModel).reduce((s, arr) => s + (arr[i] || 0), 0);
                    const maxTotal = Math.max(...trendDates.map((_, j) =>
                      Object.values(trendByModel).reduce((s, arr) => s + (arr[j] || 0), 0)
                    ), 1);
                    return (
                      <div key={date} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-gray-500" style={{ fontSize: '9px' }}>{total}</span>
                        <div className="w-full rounded-t" style={{
                          height: `${Math.max((total / maxTotal) * 72, total > 0 ? 4 : 0)}px`,
                          backgroundColor: '#3b82f6',
                          minHeight: total > 0 ? '4px' : '0'
                        }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 mt-1">
                  {trendDates.map(date => (
                    <div key={date} className="flex-1 text-center" style={{ fontSize: '9px', color: '#9ca3af' }}>{date}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {stats?.total && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-around text-center">
              <div>
                <div className="text-base font-bold text-gray-800">{Number(stats.total.total_msgs || 0).toLocaleString()}</div>
                <div className="text-xs text-gray-400">累计路由消息</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-800">{Number(stats.total.total_classify || 0).toLocaleString()}</div>
                <div className="text-xs text-gray-400">累计分类 tokens</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>}
    </div>
  );
}
