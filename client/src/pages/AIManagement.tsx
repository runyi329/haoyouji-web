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

type MainTab = 'token' | 'route' | 'assistant' | 'cert' | 'params' | 'reports';

const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
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
  const [activeTab, setActiveTab] = useState<MainTab>('token');

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => window.history.back()} className="p-1 -ml-1">
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
