/**
 * WecomRoutePanel - 企业微信 AI 路由配置组件
 * 供 AIManagement（AI管理 → AI路由 Tab）和 WecomAdmin（企业微信管理 → 路由 Tab）共用
 * 两处入口操作的是同一份后端数据，完全联动
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Save, Loader2, Edit2, ToggleLeft, ToggleRight, Settings, Sparkles
} from 'lucide-react';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const ROUTE_MODEL_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  'deepseek-flash': { label: 'DeepSeek 快速', color: 'bg-yellow-100 text-yellow-700', emoji: '⚡' },
  'deepseek-reasoner': { label: 'DeepSeek 深思', color: 'bg-orange-100 text-orange-700', emoji: '🧠' },
  'manus-max': { label: 'Manus Max', color: 'bg-purple-100 text-purple-700', emoji: '🔴' },
  'manus-standard': { label: 'Manus 标准', color: 'bg-blue-100 text-blue-700', emoji: '🟡' },
  'manus-lite': { label: 'Manus 轻量', color: 'bg-green-100 text-green-700', emoji: '🟢' },
};

// ─── 专属规则占位（待后续实现） ──────────────────────────────────────────────

function CustomRulesTab() {
  return (
    <div className="px-4 py-8 text-center text-xs text-gray-400">
      专属规则功能开发中，敬请期待
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function WecomRoutePanel() {
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
  const [menuKeys, setMenuKeys] = useState<{key:string;name:string;desc:string;vars:string[]}[]>([]);
  const [menuReplies, setMenuReplies] = useState<Record<string,string>>({});
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
              routeSubTab === 'config' ? 'bg-white text-blue-600 font-medium shadow-sm' : 'text-gray-500'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />路由配置
          </button>
          <button
            onClick={() => setRouteSubTab('rules')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-all ${
              routeSubTab === 'rules' ? 'bg-white text-blue-600 font-medium shadow-sm' : 'text-gray-500'
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
                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={saveConfig} disabled={savingConfig}>
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
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
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
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
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
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
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
            <div className="w-1 h-4 bg-blue-500 rounded-full" />
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
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
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
