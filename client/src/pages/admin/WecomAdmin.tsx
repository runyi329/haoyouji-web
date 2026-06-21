import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, Trash2, Edit2, Plus, Check, X, Bot,
  Zap, MessageSquare, User, BarChart2, Menu, ChevronRight,
  Clock, Settings, AlertCircle, PlayCircle, StopCircle, Coins, Loader2,
  Sparkles, Save, ToggleLeft, ToggleRight, Ban, Shield
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import WecomBindingManager from "./WecomBindingManager";
import WecomRoutePanel from "@/components/WecomRoutePanel";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface WecomSession {
  id: number;
  wecom_user_id: string;
  manus_task_id: string;
  nickname: string;
  model_pref?: string;
  system_prompt?: string;
  enabled?: number;
  status?: string;  // 'active' | 'archived'
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
  trigger_type: "keyword" | "schedule" | "always";
  trigger_value: string;
  action_type: "prompt_override" | "fixed_reply" | "block";
  action_value: string;
  enabled: number;
  created_at: string;
}

interface UsageStat {
  nickname: string;
  wecom_user_id: string;
  total_cost: number;        // Manus 积分（兼容旧字段）
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
  type: "click" | "view";
  name: string;
  key?: string;
  url?: string;
  sub_button?: MenuItem[];
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: "manus-1.6-max", label: "Max", desc: "最强能力" },
  { value: "manus-1.6", label: "标准", desc: "平衡性能" },
  { value: "manus-1.6-lite", label: "轻量", desc: "快速省积分" },
];

const MODEL_COLOR: Record<string, string> = {
  "manus-1.6-max": "bg-purple-100 text-purple-700",
  "manus-1.6": "bg-blue-100 text-blue-700",
  "manus-1.6-lite": "bg-green-100 text-green-700",
};

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  // 支持Unix时间戳（纯数字字符串）
  const ts = Number(dateStr);
  const d = isNaN(ts) || dateStr.includes("-") ? new Date(dateStr) : new Date(ts * 1000);
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

// 简短日期：只显示年月日
function formatShortDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
}

// 计算从某日期到现在的天数
function calcDays(dateStr: string) {
  if (!dateStr) return "-";
  // 将 'YYYY-MM-DD HH:mm:ss' 格式转为 ISO 格式避免时区解析问题
  const normalized = dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : '+08:00');
  const start = new Date(normalized).getTime();
  const now = Date.now();
  const diff = now - start;
  if (diff < 0) return "1天"; // 防止负数
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "1天";
  return `${days}天`;
}

// 积分转元：4000积分 = 148元，1积分 = 0.037元
function creditsToYuan(credits: number) {
  return (credits * 0.037).toFixed(2);
}

// ─── Tab 按钮 ────────────────────────────────────────────────────────────────

type TabKey = "binding" | "users" | "workflow" | "messages" | "stats" | "menu" | "channel";

// Link2 图标内联引入
const Link2Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "binding", label: "账号绑定", icon: <Link2Icon /> },
  { key: "users", label: "客服用户", icon: <User className="w-4 h-4" /> },
  { key: "workflow", label: "工作流", icon: <Zap className="w-4 h-4" /> },
  { key: "messages", label: "消息", icon: <MessageSquare className="w-4 h-4" /> },
  { key: "stats", label: "统计", icon: <BarChart2 className="w-4 h-4" /> },
  { key: "menu", label: "菜单", icon: <Menu className="w-4 h-4" /> },
  { key: "channel", label: "渠道", icon: <Settings className="w-4 h-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════════

export default function WecomAdmin() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("binding");

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => window.history.back()} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <Bot className="w-5 h-5 text-blue-600" />
        <h1 className="text-base font-semibold text-gray-900 flex-1">企业微信管理</h1>
      </div>

      {/* Tab 内容 */}
      <div className="pt-2">
        {activeTab === "binding" && <WecomBindingManager />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "messages" && <MessagesTab />}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "menu" && <MenuTab />}
        {activeTab === "channel" && <ChannelTab />}
      </div>

      {/* 底部 Tab 栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 max-w-md mx-auto">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                activeTab === tab.key
                  ? "text-blue-600 font-medium"
                  : "text-gray-400"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1: 用户管理
// ═══════════════════════════════════════════════════════════════════════════════

interface ManusTask { id: string; title: string; agent_profile?: string; }
interface WecomUser { userid: string; name: string; }

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
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const filtered = options.filter(o =>
    (o[displayKey] || "").toLowerCase().includes(search.toLowerCase()) ||
    (o[valueKey] || "").toLowerCase().includes(search.toLowerCase())
  );
  const handleSelect = (o: any) => {
    const label = o[displayKey] || o[valueKey];
    setSelectedLabel(label);
    onChange(o[valueKey], label);
    setSearch("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <div
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between cursor-pointer bg-white"
        onClick={() => setOpen(v => !v)}
      >
        <span className={selectedLabel ? "text-gray-900" : "text-gray-400"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
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
                  value === o[valueKey] ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
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

function UsersTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<WecomSession>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ wecom_user_id: "", manus_task_id: "", nickname: "" });
  const [manusTasks, setManusTasks] = useState<ManusTask[]>([]);
  const [wecomUsers, setWecomUsers] = useState<WecomUser[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [wecomUsersError, setWecomUsersError] = useState("");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wecom/sessions");
      const data = await res.json();
      if (data.ok) setSessions(data.sessions || []);
      else toast.error("加载失败：" + (data.error || "未知错误"));
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    // 每 30 秒静默轮询，同步企微端模型切换
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/wecom/sessions");
        const data = await res.json();
        if (data.ok) setSessions(data.sessions || []);
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchSessions]);

  const fetchDropdownData = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch("/api/wecom/manus-tasks?limit=50"),
        fetch("/api/wecom/wecom-users"),
      ]);
      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();
      setManusTasks(tasksData.tasks || []);
      if (usersData.error) {
        setWecomUsersError(usersData.error);
        setWecomUsers([]);
      } else {
        setWecomUsers(usersData.users || []);
        setWecomUsersError("");
      }
    } catch {
      toast.error("加载下拉数据失败");
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const handleArchive = async (id: number, nickname: string) => {
    if (!confirm(`确认归档「${nickname || id}」的绑定？\n\n归档后该用户下次发消息会自动创建新任务，历史绑定和积分记录会完整保留。`)) return;
    try {
      const res = await fetch(`/api/wecom/sessions/${id}/archive`, { method: "POST" });
      const data = await res.json();
      if (data.ok) { toast.success("归档成功，积分记录已保留"); fetchSessions(); }
      else toast.error("归档失败：" + (data.error || "未知错误"));
    } catch { toast.error("网络错误，请重试"); }
  };

  const handleToggleEnabled = async (session: WecomSession) => {
    try {
      const res = await fetch("/api/wecom/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wecom_user_id: session.wecom_user_id,
          manus_task_id: session.manus_task_id,
          nickname: session.nickname,
          model_pref: session.model_pref,
          system_prompt: session.system_prompt,
          enabled: session.enabled ? 0 : 1,
        }),
      });
      const data = await res.json();
      if (data.ok) { toast.success(session.enabled ? "已禁用" : "已启用"); fetchSessions(); }
      else toast.error("操作失败");
    } catch { toast.error("网络错误"); }
  };

  const handleSaveEdit = async (session: WecomSession) => {
    try {
      const res = await fetch("/api/wecom/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wecom_user_id: session.wecom_user_id,
          manus_task_id: editForm.manus_task_id || session.manus_task_id,
          nickname: editForm.nickname || "",
          model_pref: editForm.model_pref || "manus-1.6-max",
          system_prompt: editForm.system_prompt || "",
          enabled: session.enabled ?? 1,
        }),
      });
      const data = await res.json();
      if (data.ok) { toast.success("保存成功"); setEditingId(null); fetchSessions(); }
      else toast.error("保存失败：" + (data.error || "未知错误"));
    } catch { toast.error("网络错误"); }
  };

  const handleAdd = async () => {
    if (!addForm.wecom_user_id || !addForm.manus_task_id) {
      toast.error("企业微信用户ID和Manus任务ID为必填项");
      return;
    }
    try {
      const res = await fetch("/api/wecom/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("绑定成功");
        setShowAddForm(false);
        setAddForm({ wecom_user_id: "", manus_task_id: "", nickname: "" });
        fetchSessions();
      } else toast.error("绑定失败：" + (data.error || "未知错误"));
    } catch { toast.error("网络错误"); }
  };

  return (
    <div className="px-4 space-y-3">
      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-blue-600">{sessions.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">绑定用户</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-purple-600">
            {sessions.filter(s => !s.model_pref || s.model_pref === "manus-1.6-max").length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Max 用户</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-green-600">
            {sessions.filter(s => s.enabled !== 0).length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">已启用</div>
        </div>
      </div>

      {/* 刷新 + 添加 */}
      <div className="flex gap-2">
        <button
          onClick={fetchSessions}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
        <button
          onClick={() => { setShowAddForm(v => !v); if (!showAddForm) fetchDropdownData(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          手动绑定用户
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-blue-100">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">手动绑定新用户</div>
            {loadingTasks && <span className="text-xs text-gray-400">加载中...</span>}
          </div>

          {/* 企业微信用户 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">企业微信用户 *</label>
            {wecomUsers.length > 0 ? (
              <SearchSelect
                options={wecomUsers}
                value={addForm.wecom_user_id}
                onChange={val => setAddForm(f => ({ ...f, wecom_user_id: val }))}
                placeholder="选择企业微信成员..."
                displayKey="name"
                valueKey="userid"
                labelKey="userid"
              />
            ) : (
              <div>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="输入企业微信 userId，如：HuYongYu"
                  value={addForm.wecom_user_id}
                  onChange={e => setAddForm(f => ({ ...f, wecom_user_id: e.target.value }))}
                />
                {wecomUsersError && (
                  <div className="text-xs text-orange-500 mt-1">⚠ 无法拉取成员列表（{wecomUsersError.slice(0,30)}），请手动输入</div>
                )}
              </div>
            )}
          </div>

          {/* Manus 任务 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Manus 任务 *</label>
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
                placeholder="输入任务 ID，如：6iJ9mQRxzykTSqFHtz5KFp"
                value={addForm.manus_task_id}
                onChange={e => setAddForm(f => ({ ...f, manus_task_id: e.target.value }))}
              />
            )}
          </div>

          {/* 备注名 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注名（可选）</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="如：胡勇宇"
              value={addForm.nickname}
              onChange={e => setAddForm(f => ({ ...f, nickname: e.target.value }))}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              确认绑定
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddForm({ wecom_user_id: "", manus_task_id: "", nickname: "" }); }}
              className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
            >
              取消
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
                    value={editForm.nickname || ""}
                    onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Manus 任务</label>
                  {manusTasks.length > 0 ? (
                    <SearchSelect
                      options={manusTasks}
                      value={editForm.manus_task_id || ""}
                      onChange={val => setEditForm(f => ({ ...f, manus_task_id: val }))}
                      placeholder="选择 Manus 任务..."
                      displayKey="title"
                      valueKey="id"
                      labelKey="id"
                    />
                  ) : (
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                      value={editForm.manus_task_id || ""}
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
                          (editForm.model_pref || "manus-1.6-max") === opt.value
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-200"
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
                    placeholder="设置后，每次用户发消息时会在前面附加这段提示词，用于约束回复格式、范围等。&#10;例如：请用简洁的中文回答，每次回复不超过200字。"
                    value={editForm.system_prompt || ""}
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
                          session.enabled === 0 ? "border-gray-200 opacity-50" : "border-blue-100"
                        }`}
                      />
                    ) : (
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        session.enabled === 0 ? "bg-gray-100" : "bg-blue-100"
                      }`}>
                        <User className={`w-4 h-4 ${session.enabled === 0 ? "text-gray-400" : "text-blue-600"}`} />
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
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      MODEL_COLOR[session.model_pref || "manus-1.6-max"]
                    }`}>
                      {MODEL_OPTIONS.find(m => m.value === (session.model_pref || "manus-1.6-max"))?.label || "Max"}
                    </span>
                  </div>
                </div>

                {session.task_title && (
                  <div className="text-xs text-blue-600 font-medium truncate mb-0.5">
                    {session.task_title}
                  </div>
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
                    onClick={() => { setEditingId(session.id); setEditForm({ nickname: session.nickname, manus_task_id: session.manus_task_id, model_pref: session.model_pref || "manus-1.6-max", system_prompt: session.system_prompt || "" }); fetchDropdownData(); }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs border border-gray-200"
                  >
                    <Edit2 className="w-3 h-3" /> 编辑
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(session)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border ${
                      session.enabled === 0
                        ? "bg-green-50 text-green-600 border-green-200"
                        : "bg-orange-50 text-orange-600 border-orange-200"
                    }`}
                  >
                    {session.enabled === 0 ? <PlayCircle className="w-3 h-3" /> : <StopCircle className="w-3 h-3" />}
                    {session.enabled === 0 ? "启用" : "禁用"}
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2: 工作流
// ═══════════════════════════════════════════════════════════════════════════════

function WorkflowTab() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    trigger_type: "keyword" as WorkflowRule["trigger_type"],
    trigger_value: "",
    action_type: "prompt_override" as WorkflowRule["action_type"],
    action_value: "",
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wecom/workflow-rules");
      const data = await res.json();
      if (data.ok) setRules(data.rules || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.trigger_value || !addForm.action_value) {
      toast.error("请填写完整信息");
      return;
    }
    try {
      const res = await fetch("/api/wecom/workflow-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("规则已创建");
        setShowAdd(false);
        setAddForm({ name: "", trigger_type: "keyword", trigger_value: "", action_type: "prompt_override", action_value: "" });
        fetchRules();
      } else toast.error(data.error || "创建失败");
    } catch { toast.error("网络错误"); }
  };

  const handleToggle = async (rule: WorkflowRule) => {
    try {
      const res = await fetch(`/api/wecom/workflow-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: rule.enabled ? 0 : 1 }),
      });
      const data = await res.json();
      if (data.ok) { fetchRules(); toast.success(rule.enabled ? "已停用" : "已启用"); }
    } catch { toast.error("网络错误"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除此规则？")) return;
    try {
      const res = await fetch(`/api/wecom/workflow-rules/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) { toast.success("已删除"); fetchRules(); }
    } catch { toast.error("网络错误"); }
  };

  const TRIGGER_LABELS: Record<string, string> = {
    keyword: "关键词触发",
    schedule: "定时触发",
    always: "每次触发",
  };

  const ACTION_LABELS: Record<string, string> = {
    prompt_override: "注入提示词",
    fixed_reply: "固定回复",
    block: "拦截消息",
  };

  const ACTION_COLORS: Record<string, string> = {
    prompt_override: "bg-blue-100 text-blue-700",
    fixed_reply: "bg-green-100 text-green-700",
    block: "bg-red-100 text-red-700",
  };

  return (
    <div className="px-4 space-y-3">
      {/* 说明卡片 */}
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <div className="text-xs font-medium text-blue-800 mb-1">工作流规则</div>
        <div className="text-xs text-blue-600 leading-relaxed">
          当用户发送消息时，按规则顺序匹配。可设置关键词触发、定时推送、消息拦截等自动化规则。
        </div>
      </div>

      {/* 添加按钮 */}
      <div className="flex gap-2">
        <button
          onClick={fetchRules}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新建规则
        </button>
      </div>

      {/* 添加表单 */}
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
              {(["keyword", "schedule", "always"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAddForm(f => ({ ...f, trigger_type: t }))}
                  className={`py-2 rounded-lg text-xs font-medium border ${
                    addForm.trigger_type === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {TRIGGER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {addForm.trigger_type === "keyword" ? "触发关键词（多个用逗号分隔）" :
               addForm.trigger_type === "schedule" ? "Cron 表达式（如：0 9 * * * 每天9点）" :
               "触发说明（填写任意内容）"}
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder={addForm.trigger_type === "keyword" ? "广告,推广,优惠" : addForm.trigger_type === "schedule" ? "0 9 * * *" : "所有消息"}
              value={addForm.trigger_value}
              onChange={e => setAddForm(f => ({ ...f, trigger_value: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">执行动作</label>
            <div className="grid grid-cols-3 gap-2">
              {(["prompt_override", "fixed_reply", "block"] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setAddForm(f => ({ ...f, action_type: a }))}
                  className={`py-2 rounded-lg text-xs font-medium border ${
                    addForm.action_type === a ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {addForm.action_type === "prompt_override" ? "注入的提示词内容" :
               addForm.action_type === "fixed_reply" ? "固定回复内容" :
               "拦截提示（发送给用户的提示，留空则不回复）"}
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder={addForm.action_type === "prompt_override" ? "请用简洁的中文回答..." : addForm.action_type === "fixed_reply" ? "您好，该功能暂不支持..." : "抱歉，该类消息不支持处理"}
              value={addForm.action_value}
              onChange={e => setAddForm(f => ({ ...f, action_value: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              创建规则
            </button>
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
              取消
            </button>
          </div>
        </div>
      )}

      {/* 规则列表 */}
      {loading && rules.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无工作流规则</div>
      ) : (
        rules.map(rule => (
          <div key={rule.id} className={`bg-white rounded-xl shadow-sm p-4 ${rule.enabled === 0 ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {TRIGGER_LABELS[rule.trigger_type]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_COLORS[rule.action_type]}`}>
                    {ACTION_LABELS[rule.action_type]}
                  </span>
                </div>
              </div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${rule.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {rule.enabled ? "运行中" : "已停用"}
              </div>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-2">
              <span className="text-gray-400">触发: </span>{rule.trigger_value}
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-3 line-clamp-2">
              <span className="text-gray-400">动作: </span>{rule.action_value || "（拦截，不回复）"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggle(rule)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border ${
                  rule.enabled ? "bg-orange-50 text-orange-600 border-orange-200" : "bg-green-50 text-green-600 border-green-200"
                }`}
              >
                {rule.enabled ? <StopCircle className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                {rule.enabled ? "停用" : "启用"}
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3: 消息记录
// ═══════════════════════════════════════════════════════════════════════════════

function MessagesTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [selectedUser, setSelectedUser] = useState<WecomSession | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    setLoadingUsers(true);
    fetch("/api/wecom/sessions")
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
      else toast.error(data.error || "加载失败");
    } catch { toast.error("网络错误"); }
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
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-800 shadow-sm border border-gray-100"
                }`}>
                  <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.timestamp && (
                    <div className={`text-xs mt-1 ${msg.role === "user" ? "text-blue-200" : "text-gray-400"}`}>
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4: 使用统计
// ═══════════════════════════════════════════════════════════════════════════════

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
  // 消息级字段（当 record_type === 'message' 时存在）
  record_type?: "message" | "task";
  user_message?: string;  // 用户发送的消息
  reply_preview?: string; // AI回复预览
}

function UserDetailModal({ wecomUserId, displayName, onClose }: { wecomUserId: string; displayName: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<UserDetailSession[]>([]);
  const [records, setRecords] = useState<UserDetailRecord[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);
  const [usdtCnyRate, setUsdtCnyRate] = useState<number>(7.0);
  const [useMessageCredits, setUseMessageCredits] = useState(false);

  // 积分转人民币：1积分 = 0.037元（基于4000积分=148元官方定价）
  const creditsToUsdt = (credits: number) => {
    return (credits * 0.037).toFixed(2);
  };

  useEffect(() => {
    fetch(`/api/wecom/user-detail?wecom_user_id=${encodeURIComponent(wecomUserId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setSessions(data.sessions || []);
          setRecords(data.records || []);
          if (data.usdt_cny_rate) setUsdtCnyRate(data.usdt_cny_rate);
          setUseMessageCredits(!!data.use_message_credits);
        } else toast.error(data.error || "加载失败");
      })
      .catch(() => toast.error("网络错误"))
      .finally(() => setLoading(false));
  }, [wecomUserId]);

  const totalCost = sessions.reduce((s, t) => s + t.total_cost, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* 顶栏 */}
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
                {/* 任务头部 */}
                <div
                  className="px-4 py-3 flex items-start justify-between cursor-pointer active:bg-gray-50"
                  onClick={() => setExpandedTask(isExpanded ? null : s.manus_task_id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>{s.status === "active" ? "当前" : "已归档"}</span>
                      <span className="text-xs text-gray-400">{formatDate(s.created_at)} 绑定</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {s.task_title || s.manus_task_id}
                    </div>
                    {s.task_title && (
                      <div className="text-xs text-gray-400 font-mono truncate mt-0.5">{s.manus_task_id}</div>
                    )}
                  </div>
                  <div className="ml-3 text-right flex-shrink-0">
                    <div className="text-sm font-bold text-blue-600">{Math.round(s.total_cost)}</div>
                    <div className="text-xs text-gray-400">{s.record_count} 条</div>
                  </div>
                  <ChevronRight className={`ml-2 w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </div>

                {/* 展开明细 */}
                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {taskRecords.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-400 text-center">暂无积分消耗记录</div>
                    ) : useMessageCredits ? (
                      // 消息级明细：每条消息一行，可展开查看内容
                      <div>
                        <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-400 font-medium">
                          <span>用户消息</span>
                          <span>消耗算力 / 元</span>
                        </div>
                        {taskRecords.map((r, i) => {
                          const isExpMsg = expandedMsg === (r.id ?? i);
                          return (
                            <div key={r.id ?? i} className="border-b border-gray-50 last:border-0">
                              {/* 消息主行 */}
                              <div
                                className="px-4 py-2.5 flex items-start gap-2 cursor-pointer active:bg-gray-50"
                                onClick={() => setExpandedMsg(isExpMsg ? null : (r.id ?? i))}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-500 mb-0.5">{formatDate(r.created_at)}</div>
                                  <div className="text-sm text-gray-800 truncate">
                                    {r.user_message || "(无内容)"}
                                  </div>
                                </div>
                                <div className="flex-shrink-0 text-right ml-2">
                                  <div className="text-sm font-bold text-blue-600">-{Math.round(r.credits)}</div>
                                  <div className="text-xs text-green-600">{creditsToYuan(r.credits)}</div>
                                </div>
                                <ChevronRight className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1 transition-transform ${isExpMsg ? "rotate-90" : ""}`} />
                              </div>
                              {/* 展开：AI回复预览 + 积分详情 */}
                              {isExpMsg && (
                                <div className="px-4 pb-3 bg-gray-50 space-y-2">
                                  {r.reply_preview && (
                                    <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                                      <div className="text-xs text-gray-400 mb-1">AI 回复预览</div>
                                      <div className="text-xs text-gray-700 leading-relaxed">{r.reply_preview}</div>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>算力 {r.credits_before ?? "?"} → {r.credits_after ?? "?"}</span>
                                    <span>{creditsToUsdt(r.credits)} 元</span>
                                  </div>
                                  {r.model && (
                                    <div className="text-xs text-gray-400">模型: {r.model}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // 降级：任务级记录（旧格式）
                      <div>
                        <div className="px-4 py-2 bg-gray-50 grid grid-cols-3 text-xs text-gray-400 font-medium">
                          <span>时间</span>
                          <span className="text-center">消耗算力</span>
                          <span className="text-right"><div>元</div><div>U</div></span>
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
  const [totalCny, setTotalCny] = useState(0);
  const [viewMode, setViewMode] = useState<'user' | 'time' | 'ai'>('user');
  const [userSortBy, setUserSortBy] = useState<'default' | 'cny'>('default');
  const [daily, setDaily] = useState<any[]>([]);
  const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);

  // 三维筛选状态
  type TimeRange = 'all' | 'today' | 'week' | 'month' | 'custom';
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [aiModel, setAiModel] = useState<'all' | 'manus' | 'deepseek' | 'ds_flash' | 'ds_pro'>('all');
  const [showAiDropdown, setShowAiDropdown] = useState(false);

  const getLocalDateRange = (range: TimeRange): { start: string; end: string } | null => {
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
    const dr = r === 'custom' ? (cs && ce ? { start: cs, end: ce } : null) : getLocalDateRange(r);
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
      const [statsRes, dailyRes] = await Promise.all([
        fetch(`/api/wecom/stats${query}`),
        fetch(`/api/wecom/stats/daily${query}`),
      ]);
      const [statsData, dailyData] = await Promise.all([statsRes.json(), dailyRes.json()]);
      if (statsData.ok) {
        setStats(statsData.stats || []);
        setTotalCost(statsData.total_cost || 0);
        setTotalCny(statsData.total_cny || 0);
      } else toast.error(statsData.error || '加载失败');
      if (dailyData.ok) setDaily(dailyData.daily || []);
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [timeRange, customStart, customEnd, selectedUsers, aiModel]);

  useEffect(() => {
    fetchStats();
    fetch('/api/wecom/stats').then(r => r.json()).then(d => {
      if (d.ok) setAllStats(d.stats || []);
    });
  }, []);

  const sortedStats = userSortBy === 'cny'
    ? [...stats].sort((a, b) => (b.total_cny || 0) - (a.total_cny || 0))
    : stats;

  if (detailUser) {
    return <UserDetailModal wecomUserId={detailUser.id} displayName={detailUser.name} onClose={() => setDetailUser(null)} />;
  }

  return (
    <div className="px-4 space-y-3">
      {/* 总消耗卡片 */}
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
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-100 rounded-xl p-1 flex-1">
          {(['user', 'time', 'ai'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {mode === 'user' ? '按用户' : mode === 'time' ? '按时间' : 'AI汇总'}
            </button>
          ))}
        </div>
        {/* 按用户时显示排序切换 */}
        {viewMode === 'user' && (
          <button
            onClick={() => setUserSortBy(userSortBy === 'default' ? 'cny' : 'default')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              userSortBy === 'cny' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {userSortBy === 'cny' ? '按费用↓' : '默认排序'}
          </button>
        )}
      </div>

      {/* 三维筛选条 */}
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
              {(['all','today','week','month','custom'] as const).map((v) => {
                const label = v === 'all' ? '全部' : v === 'today' ? '今天' : v === 'week' ? '本周' : v === 'month' ? '本月' : '自定义…';
                return (
                  <button
                    key={v}
                    onClick={() => {
                      setTimeRange(v);
                      setShowCustomInput(v === 'custom');
                      setShowTimeDropdown(false);
                      if (v !== 'custom') fetchStats({ range: v });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${timeRange === v ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                  >{label}</button>
                );
              })}
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

        {/* AI模型下拉 */}
        <div className="relative flex-1">
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
              {(['all','manus','deepseek','ds_flash','ds_pro'] as const).map((v) => {
                const label = v === 'all' ? '全部' : v === 'manus' ? 'Manus' : v === 'deepseek' ? 'DeepSeek' : v === 'ds_flash' ? 'DS Flash' : 'DS Pro';
                return (
                  <button
                    key={v}
                    onClick={() => { setAiModel(v); fetchStats({ model: v }); setShowAiDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${aiModel === v ? 'text-purple-600 font-medium' : 'text-gray-700'}`}
                  >{label}</button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 自定义日期输入 */}
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

          {/* 按用户 */}
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
                {sortedStats.map((stat, i) => (
                  <tr key={i}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
                    onClick={() => setDetailUser({ id: stat.wecom_user_id, name: stat.nickname || stat.wecom_user_id })}>
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

          {/* 按时间 - 日期列表 */}
          {viewMode === 'time' && (
            daily.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">暂无日期数据</div>
            ) : (
              <table className="w-auto border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">日期</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">活跃用户</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">消息数</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">Manus积分</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">DS tokens</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">当日费用（元）</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 border-r border-gray-100 whitespace-nowrap">
                        <div className="font-medium text-gray-900 text-sm">{d.date}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{d.user_count}人</td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-600 border-r border-gray-100">{d.record_count}</td>
                      <td className="px-3 py-2.5 text-center border-r border-gray-100">
                        <div className="text-sm font-semibold text-blue-600">{Math.round(d.manus_credits)}</div>
                        <div className="text-xs text-gray-400">¥{d.manus_cny.toFixed(2)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center border-r border-gray-100">
                        <div className="text-sm font-semibold text-purple-600">{Math.round(d.ds_total_tokens)}</div>
                        <div className="text-xs text-gray-400">¥{d.ds_cny.toFixed(4)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="text-sm font-bold text-green-600">¥{d.total_cny.toFixed(2)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

        </div>
      )}

      {/* AI汇总视图 */}
      {viewMode === 'ai' && (
        <div className="space-y-3">
          {/* Manus 卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Manus</span>
              <span className="text-sm font-medium text-blue-800">{Math.round(stats.reduce((s, r) => s + (r.manus_credits || r.total_cost || 0), 0))} 积分</span>
              <span className="ml-auto text-sm font-bold text-blue-700">¥{stats.reduce((s, r) => s + (r.manus_cny || (r.total_cost || 0) * 0.037), 0).toFixed(2)}</span>
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
              <span className="text-sm font-medium text-purple-800">{Math.round(stats.reduce((s, r) => s + (r.ds_total_tokens || 0), 0))} tokens</span>
              <span className="ml-auto text-sm font-bold text-purple-700">¥{stats.reduce((s, r) => s + (r.ds_cny || 0), 0).toFixed(4)}</span>
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5: 菜单配置
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MENU: MenuItem[] = [
  {
    name: "切换模型",
    type: "click",
    key: "",
    sub_button: [
      { name: "Max 模式", type: "click", key: "MODEL_MAX" },
      { name: "标准模式", type: "click", key: "MODEL_NORMAL" },
      { name: "轻量模式", type: "click", key: "MODEL_LITE" },
      { name: "DeepSeek", type: "click", key: "MODEL_DS_FLASH" },
      { name: "", type: "click", key: "RESERVED_1_5" },
    ],
  },
  {
    name: "工具箱",
    type: "click",
    key: "",
    sub_button: [
      { name: "查积分", type: "click", key: "CREDITS_QUERY" },
      { name: "新对话", type: "click", key: "NEW_TASK" },
      { name: "任务状态", type: "click", key: "TASK_STATUS" },
      { name: "预留", type: "click", key: "RESERVED_2_4" },
      { name: "预留", type: "click", key: "RESERVED_2_5" },
    ],
  },
  {
    name: "更多",
    type: "click",
    key: "",
    sub_button: [
      { name: "使用帮助", type: "click", key: "HELP" },
      { name: "意见反馈", type: "click", key: "FEEDBACK" },
      { name: "预留", type: "click", key: "RESERVED_3_3" },
      { name: "预留", type: "click", key: "RESERVED_3_4" },
      { name: "预留", type: "click", key: "RESERVED_3_5" },
    ],
  },
];

function MenuTab() {
  const [menu, setMenu] = useState<MenuItem[]>(DEFAULT_MENU);
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const handleNameChange = (i: number, j: number | null, val: string) => {
    const m = JSON.parse(JSON.stringify(menu)) as MenuItem[];
    if (j === null) m[i].name = val;
    else if (m[i].sub_button) m[i].sub_button![j].name = val;
    setMenu(m);
  };

  const handleKeyChange = (i: number, j: number, val: string) => {
    const m = JSON.parse(JSON.stringify(menu)) as MenuItem[];
    if (m[i].sub_button) m[i].sub_button![j].key = val;
    setMenu(m);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/wecom/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu }),
      });
      const data = await res.json();
      if (data.ok) toast.success("菜单已更新，企业微信端稍后生效");
      else toast.error(data.error || "更新失败");
    } catch { toast.error("网络错误"); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 space-y-3">
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
        <div className="text-xs font-medium text-amber-800 mb-1">菜单配置</div>
        <div className="text-xs text-amber-700 leading-relaxed">
          企业微信应用最多3个一级菜单，每个下最多5个子菜单。修改后点击"推送菜单"即可生效。
        </div>
      </div>

      {menu.map((item, i) => (
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
            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedIdx === i ? "rotate-90" : ""}`} />
          </button>

          {expandedIdx === i && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
              <div className="pt-3">
                <label className="text-xs text-gray-500 mb-1 block">一级菜单名称</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={item.name}
                  onChange={e => handleNameChange(i, null, e.target.value)}
                  maxLength={4}
                />
                <div className="text-xs text-gray-400 mt-0.5">最多4个字</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600">子菜单</div>
                {item.sub_button?.map((sub, j) => (
                  <div key={j} className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4">{j + 1}.</span>
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        placeholder="菜单名称（最多8字）"
                        value={sub.name}
                        onChange={e => handleNameChange(i, j, e.target.value)}
                        maxLength={8}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4"></span>
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white font-mono"
                        placeholder="Key（如：MODEL_MAX）"
                        value={sub.key || ""}
                        onChange={e => handleKeyChange(i, j, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-60"
      >
        {saving ? "推送中..." : "推送菜单到企业微信"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 7: 渠道管理
// ═══════════════════════════════════════════════════════════════════════════════

interface Channel {
  id: number;
  name: string;
  channel_type: "app" | "kf";
  project_key: string | null;
  kf_id: string | null;
  is_enabled: number;
  app_id: number | null;
  created_at: string;
}

interface WecomApp {
  id: number;
  name: string;
  corp_id: string;
  agent_id: string;
  callback_url: string;
  is_enabled: number;
  created_at: string;
}

function ChannelTab() {
  const [apps, setApps] = useState<WecomApp[]>([]);
  const [loading, setLoading] = useState(true);
  // 三级导航： null=应用列表, WecomApp=渠道列表, Channel=渠道详情
  const [selectedApp, setSelectedApp] = useState<WecomApp | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  useEffect(() => { fetchApps(); }, []);

  async function fetchApps() {
    setLoading(true);
    try {
      const res = await fetch("/api/wecom/apps");
      const data = await res.json();
      setApps(data.apps || []);
    } catch (e) {
      toast.error("获取应用列表失败");
    } finally {
      setLoading(false);
    }
  }

  // 第三级：渠道详情
  if (selectedChannel) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelectedChannel(null)}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-600"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{selectedChannel.name}</h2>
            <p className="text-xs text-gray-400">
              {selectedApp?.name} · {selectedChannel.channel_type === "app" ? "客户联系" : "微信客服"}
            </p>
          </div>
        </div>
        <ChannelDetail channel={selectedChannel} />
      </div>
    );
  }

  // 第二级：渠道列表（某个应用下的联系方式）
  if (selectedApp) {
    return <AppChannelList app={selectedApp} onSelectChannel={setSelectedChannel} onBack={() => setSelectedApp(null)} />;
  }

  // 第一级：应用列表
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">渠道列表</h2>
        <button
          onClick={fetchApps}
          className="text-xs text-blue-600 border border-blue-200 rounded-full px-3 py-1"
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-4 active:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{app.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">自建应用 · CorpID: {app.corp_id}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  app.is_enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                }`}>
                  {app.is_enabled ? "启用" : "停用"}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </button>
          ))}
          {apps.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">暂无应用配置</div>
          )}
        </div>
      )}
    </div>
  );
}

// 第二级：应用下的渠道列表
function AppChannelList({
  app,
  onSelectChannel,
  onBack,
}: {
  app: WecomApp;
  onSelectChannel: (ch: Channel) => void;
  onBack: () => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/wecom/channels?app_id=${app.id}`)
      .then(r => r.json())
      .then(d => setChannels(d.channels || []))
      .catch(() => toast.error("获取渠道失败"))
      .finally(() => setLoading(false));
  }, [app.id]);

  return (
    <div className="px-4 py-4">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1.5 rounded-lg bg-gray-100 text-gray-600">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{app.name}</h2>
          <p className="text-xs text-gray-400">自建应用 · 选择联系方式</p>
        </div>
      </div>

      {/* 应用信息卡片 */}
      <div className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">
        <p className="text-xs font-semibold text-blue-700 mb-2">应用信息</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">CorpID</span>
            <span className="text-gray-800 font-mono">{app.corp_id}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">AgentID</span>
            <span className="text-gray-800 font-mono">{app.agent_id}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">回调地址</span>
            <span className="text-gray-800 font-mono text-right max-w-[180px] truncate">{app.callback_url || "-"}</span>
          </div>
        </div>
      </div>

      {/* 渠道列表 */}
      <p className="text-xs text-gray-500 mb-2">联系方式</p>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-4 active:bg-gray-50 transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                ch.channel_type === "app" ? "bg-blue-50" : "bg-purple-50"
              }`}>
                {ch.channel_type === "app"
                  ? <Bot className="w-5 h-5 text-blue-500" />
                  : <MessageSquare className="w-5 h-5 text-purple-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{ch.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ch.channel_type === "app" ? "客户联系" : "微信客服"}
                  {ch.kf_id ? ` · ${ch.kf_id}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  ch.is_enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                }`}>
                  {ch.is_enabled ? "启用" : "停用"}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">该应用下暂无渠道</div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// 统一渠道详情页：五Tab结构（配置/专属规则/知识库/用户/日志）
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

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

interface WecomUserForRule {
  wecom_user_id: string;
  nickname: string;
  avatar_url?: string;
}

interface ChannelUser {
  wecom_user_id: string;
  nickname: string;
  avatar_url?: string;
  msg_count: number;
  total_credits: number;
  last_active: string;
  blocked: boolean;
}

interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  item_count: number;
}

interface KnowledgeItem {
  id: number;
  kb_id?: number;
  item_type: "qa" | "doc";
  question?: string | null;
  answer: string;
  source_file?: string | null;
  source_doc?: string | null;
  chunk_index?: number | null;
  enabled?: number;
  created_at?: string;
}

interface ChatLog {
  id: number;
  wecom_user_id: string;
  user_message: string;
  reply_preview: string;
  model_used: string;
  credits_used: number;
  created_at: string;
  nickname: string | null;
  avatar_url: string | null;
  channel_type?: string;
}

const RULE_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Flash（快速、省费）' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1（深度推理）' },
  { value: 'manus-1.6-lite', label: 'Manus 轻量（快速响应）' },
  { value: 'manus-1.6', label: 'Manus 标准（平衡能力）' },
  { value: 'manus-1.6-max', label: 'Manus Max（最强能力）' },
];

const CHANNEL_AI_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek V3", desc: "高性价比" },
  { value: "deepseek-reasoner", label: "DeepSeek R1", desc: "深度推理" },
  { value: "manus-1.6-lite", label: "Manus Lite", desc: "快速省积分" },
  { value: "manus-1.6", label: "Manus 标准", desc: "平衡性能" },
  { value: "manus-1.6-max", label: "Manus Max", desc: "最强能力" },
];

// ─── 统一渠道详情主组件 ────────────────────────────────────────────────────────

function ChannelDetail({ channel }: { channel: Channel }) {
  const [activeTab, setActiveTab] = useState<"config" | "rules" | "kb" | "users" | "logs">("config");

  const tabs = [
    { key: "config", label: "配置", icon: <Settings className="w-3.5 h-3.5" /> },
    { key: "rules", label: "专属规则", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: "kb", label: "知识库", icon: <Shield className="w-3.5 h-3.5" /> },
    { key: "users", label: "用户", icon: <User className="w-3.5 h-3.5" /> },
    { key: "logs", label: "日志", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  return (
    <div>
      {/* 子Tab切换 */}
      <div className="flex gap-0.5 mb-4 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap px-1 ${
              activeTab === t.key
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && <ChannelConfigTab channel={channel} />}
      {activeTab === "rules" && <ChannelCustomRulesTab channelType={channel.channel_type} />}
      {activeTab === "kb" && <ChannelKnowledgeTab channelType={channel.channel_type} />}
      {activeTab === "users" && <ChannelUsersTab channelType={channel.channel_type} />}
      {activeTab === "logs" && <ChannelLogsTab channelType={channel.channel_type} />}
    </div>
  );
}

// ─── AI辅助指令知识库维护卡片 ──────────────────────────────────────────────────

interface AiAssistResult {
  prompt_additions: string[];
  kb_items: { question: string; answer: string }[];
  summary: string;
}

function AiAssistConfigCard({
  channelId, kbId, onApplyPrompt
}: {
  channelId: number;
  kbId: number;
  systemPrompt: string;
  onApplyPrompt: (addition: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [selectedPrompts, setSelectedPrompts] = useState<boolean[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<boolean[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);

  async function handleAnalyze() {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    setResult(null);
    setApplyDone(false);
    try {
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, channelId, kbId }),
      });
      const d = await res.json();
      if (d.ok) {
        setResult(d);
        setSelectedPrompts(d.prompt_additions.map(() => true));
        setSelectedKbs(d.kb_items.map(() => true));
      } else {
        toast.error(d.error || "AI分析失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleApply() {
    if (!result) return;
    setApplying(true);
    try {
      const chosenPrompts = result.prompt_additions.filter((_, i) => selectedPrompts[i]);
      for (const p of chosenPrompts) {
        onApplyPrompt(p);
      }
      const chosenKbs = result.kb_items.filter((_, i) => selectedKbs[i]);
      let kbSuccess = 0;
      if (kbId && chosenKbs.length > 0) {
        for (const item of chosenKbs) {
          try {
            const r = await fetch(`/api/wecom/knowledge-bases/${kbId}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_type: 'qa', question: item.question, answer: item.answer }),
            });
            const rd = await r.json();
            if (rd.ok) kbSuccess++;
          } catch {}
        }
      }
      const msgs: string[] = [];
      if (chosenPrompts.length > 0) msgs.push(`${chosenPrompts.length}条指令已写入AI指令框`);
      if (chosenKbs.length > 0) {
        if (!kbId) msgs.push(`请先绑定知识库再写入知识库条目`);
        else msgs.push(`${kbSuccess}/${chosenKbs.length}条知识库条目已写入`);
      }
      if (msgs.length > 0) toast.success(msgs.join("；"));
      setApplyDone(true);
      setTimeout(() => { setResult(null); setInputText(""); setApplyDone(false); }, 1500);
    } catch {
      toast.error("写入失败");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-800">指令知识库维护</span>
          <span className="text-xs text-purple-500 bg-purple-50 rounded px-1.5 py-0.5">AI辅助</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
          <p className="text-xs text-gray-400 pt-3">用大白话描述你对客服的要求和知识，AI 会自动分类整理，帮你写入 AI 指令或知识库</p>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="例如：客服要有耳心，不要用太官方的语气。我们的产品康宝莱F1单买99元，包含蛋白粉和维生素套餐。如果客户问价格，告诉他们具体套餐内容..."
            rows={5}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 text-gray-800 placeholder-gray-400"
          />
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !inputText.trim()}
            className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />AI 分析中...</> : <><Sparkles className="w-4 h-4" />AI 分析并建议</>}
          </button>

          {result && (
            <div className="space-y-3">
              {result.summary && (
                <div className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">{result.summary}</div>
              )}
              {result.prompt_additions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600">建议写入 AI 指令（勾选后会追加到上方指令框）</div>
                  {result.prompt_additions.map((p, i) => (
                    <button key={i} onClick={() => setSelectedPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                        selectedPrompts[i] ? 'border-purple-400 bg-purple-50 text-purple-800' : 'border-gray-200 text-gray-500'
                      }`}>
                      <div className="flex items-start gap-2">
                        <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          selectedPrompts[i] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                        }`}>{selectedPrompts[i] && <Check className="w-3 h-3 text-white" />}</div>
                        <span className="whitespace-pre-wrap">{p}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {result.kb_items.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600">
                    建议写入知识库
                    {!kbId && <span className="text-amber-500 ml-1">(请先在下方绑定知识库)</span>}
                  </div>
                  {result.kb_items.map((item, i) => (
                    <button key={i} onClick={() => setSelectedKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                        selectedKbs[i] ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-500'
                      }`}>
                      <div className="flex items-start gap-2">
                        <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          selectedKbs[i] ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>{selectedKbs[i] && <Check className="w-3 h-3 text-white" />}</div>
                        <div>
                          <div className="font-medium text-gray-700">Q: {item.question}</div>
                          <div className="text-gray-500 mt-0.5">A: {item.answer}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {(result.prompt_additions.length > 0 || result.kb_items.length > 0) && (
                <button
                  onClick={handleApply}
                  disabled={applying || applyDone}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    applyDone ? 'bg-green-500 text-white' : 'bg-gray-800 text-white disabled:opacity-50'
                  }`}
                >
                  {applying ? <><Loader2 className="w-4 h-4 animate-spin" />写入中...</>
                  : applyDone ? <><Check className="w-4 h-4" />已写入</>
                  : <><Check className="w-4 h-4" />确认写入勾选内容</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 配置Tab ──────────────────────────────────────────────────────────────────

function ChannelConfigTab({ channel }: { channel: Channel }) {
  const isApp = channel.channel_type === "app";

  // 通用配置
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("收到，AI 正在思考中，请稍候...");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [kbId, setKbId] = useState(0);
  const [contextRounds, setContextRounds] = useState(10);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);

  // 自建应用专属
  const [routeEnabled, setRouteEnabled] = useState(false);
  const [classifierModel, setClassifierModel] = useState("deepseek-chat");
  const [fallbackModel, setFallbackModel] = useState("deepseek-chat");

  // 消息抄送（仅微信客服渠道）
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyUserids, setNotifyUserids] = useState<string[]>([]);
  const [memberList, setMemberList] = useState<{userid:string;name:string}[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  // 菜单回复模板
  const [menuKeys, setMenuKeys] = useState<{key:string;name:string;desc:string;vars:string[]}[]>([]);
  const [menuReplies, setMenuReplies] = useState<Record<string,string>>({});
  const [editingReplies, setEditingReplies] = useState<Record<string,boolean>>({});
  const [savingReplies, setSavingReplies] = useState<Record<string,boolean>>({});

  // 脏数据检测：保存后快照，有改动才点亮保存按钮
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [justSaved, setJustSaved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(channel.is_enabled !== 0);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  async function handleToggleEnabled() {
    setTogglingEnabled(true);
    try {
      const newVal = isEnabled ? 0 : 1;
      const res = await fetch(`/api/wecom/channels/${channel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: channel.name,
          channel_type: channel.channel_type,
          project_key: channel.project_key,
          kf_id: channel.kf_id,
          is_enabled: newVal,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setIsEnabled(newVal === 1);
        toast.success(newVal === 1 ? "渠道已启用" : "渠道已停用");
      } else {
        toast.error(d.error || "操作失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setTogglingEnabled(false);
    }
  }

  useEffect(() => {
    const loads: Promise<any>[] = [
      fetch("/api/wecom/knowledge-bases").then(r => r.json()),
    ];
    if (isApp) {
      loads.push(fetch("/api/wecom/route-config").then(r => r.json()));
      loads.push(fetch("/api/wecom/menu").then(r => r.json()));
    } else {
      const cid = channel.id || "default";
      loads.push(fetch(`/api/wecom/channel-config/${cid}`).then(r => r.json()));
    }
    Promise.all(loads).then(([kbs, second, menuData]) => {
      if (Array.isArray(kbs)) setKbList(kbs);
      if (isApp) {
        const d = second;
        if (d.ok && d.config) {
          setRouteEnabled(d.config.route_enabled === "true");
          setClassifierModel(d.config.classifier_model || "deepseek-chat");
          setFallbackModel(d.config.fallback_model || "deepseek-chat");
          if (d.config.employee_welcome) setWelcomeMsg(d.config.employee_welcome);
          if (d.config.waiting_msg) setWaitingMsg(d.config.waiting_msg);
          if (d.config.system_prompt !== undefined) setSystemPrompt(d.config.system_prompt || "");
          if (d.config.context_rounds) setContextRounds(Number(d.config.context_rounds) || 10);
          const replies: Record<string,string> = {};
          Object.keys(d.config).forEach(k => {
            if (k.startsWith("menu_reply_")) replies[k.replace("menu_reply_", "")] = d.config[k];
          });
          setMenuReplies(replies);
        }
        // 加载菜单key
        if (menuData && menuData.ok && menuData.menu) {
          const VAR_HINTS: Record<string,{name:string;desc:string;vars:string[]}> = {
            MY_WALLET: { name: "我的钱包", desc: "查询钱包余额时的回复", vars: ["{username}=账号", "{balance}=余额(元)", "{time}=查询时间"] },
            CREDITS_QUERY: { name: "查积分", desc: "查积分前的提示语", vars: [] },
            NEW_TASK: { name: "新对话", desc: "开启新对话时的回复", vars: [] },
            TASK_STATUS: { name: "任务状态", desc: "查询任务状态时的回复", vars: ["{task_id}=任务ID", "{created_at}=创建时间", "{model}=当前模型"] },
            MODEL_MAX: { name: "Max 模式", desc: "切换模型时的回复", vars: ["{model}=模型名称"] },
            MODEL_NORMAL: { name: "标准模式", desc: "切换模型时的回复", vars: ["{model}=模型名称"] },
            MODEL_LITE: { name: "轻量模式", desc: "切换模型时的回复", vars: ["{model}=模型名称"] },
            MODEL_DS_FLASH: { name: "DeepSeek", desc: "切换模型时的回复", vars: ["{model}=模型名称"] },
            MODEL_STATUS: { name: "当前模型", desc: "查询当前模型时的回复", vars: ["{model}=模型名称"] },
            AI_EMPLOYEE: { name: "AI 员工", desc: "切换 AI 员工模式时的回复", vars: [] },
            HELP: { name: "使用帮助", desc: "点击帮助时的回复", vars: [] },
            FEEDBACK: { name: "意见反馈", desc: "点击反馈时的回复", vars: [] },
          };
          const keys: {key:string;name:string;desc:string;vars:string[]}[] = [];
          const seen = new Set<string>();
          const extractKeys = (items: any[]) => {
            for (const item of items) {
              if (item.key && !seen.has(item.key)) {
                seen.add(item.key);
                const hint = VAR_HINTS[item.key] || { name: item.name || item.key, desc: "菜单回复", vars: [] };
                keys.push({ key: item.key, name: hint.name || item.name || item.key, desc: hint.desc, vars: hint.vars });
              }
              if (item.sub_button) extractKeys(item.sub_button);
            }
          };
          extractKeys(menuData.menu);
          setMenuKeys(keys);
        }
      } else {
        const cfg = second;
        if (cfg && !cfg.error) {
          const wm = cfg.welcome_msg || "";
          const wt = cfg.waiting_msg || "收到，AI 正在思考中，请稍候...";
          const sp = cfg.system_prompt || "";
          const am = cfg.ai_model || "deepseek-chat";
          const ki = cfg.knowledge_base_id || 0;
          const cr = cfg.context_rounds || 10;
          const ne = cfg.notify_enabled === '1' || cfg.notify_enabled === true;
          const nu = cfg.notify_userids ? cfg.notify_userids.split(',').map((s:string)=>s.trim()).filter(Boolean) : [];
          setWelcomeMsg(wm);
          setWaitingMsg(wt);
          setSystemPrompt(sp);
          setAiModel(am);
          setKbId(ki);
          setContextRounds(cr);
          setNotifyEnabled(ne);
          setNotifyUserids(nu);
          // 设置初始快照
          setSavedSnapshot(JSON.stringify({ wm, wt, sp, am, ki, cr, ne, nu }));
        }
        // 加载企业成员列表（用于抄送选择）
        setMemberLoading(true);
        fetch('/api/wecom/wecom-users').then(r=>r.json()).then(d=>{
          if (d.users && d.users.length > 0) setMemberList(d.users);
        }).catch(()=>{}).finally(()=>setMemberLoading(false));
      }
    }).catch(() => toast.error("加载配置失败")).finally(() => setLoading(false));
  }, [channel.id, isApp]);

  async function handleSave() {
    setSaving(true);
    try {
      if (isApp) {
        const res = await fetch("/api/wecom/route-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: {
              route_enabled: String(routeEnabled),
              classifier_model: classifierModel,
              fallback_model: fallbackModel,
              employee_welcome: welcomeMsg,
              waiting_msg: waitingMsg,
              system_prompt: systemPrompt,
              context_rounds: String(contextRounds),
            }
          }),
        });
        const d = await res.json();
        if (d.ok) toast.success("配置已保存");
        else toast.error(d.error || "保存失败");
      } else {
        const cid = channel.id || "default";
        const res = await fetch(`/api/wecom/channel-config/${cid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            welcome_msg: welcomeMsg,
            waiting_msg: waitingMsg,
            system_prompt: systemPrompt,
            ai_model: aiModel,
            knowledge_base_id: kbId,
            context_rounds: contextRounds,
            notify_enabled: notifyEnabled ? '1' : '0',
            notify_userids: notifyUserids.join(','),
          }),
        });
        const d = await res.json();
        if (d.ok) {
          toast.success("配置已保存");
          // 更新快照，按钮恢复置灰状态
          setSavedSnapshot(JSON.stringify({
            wm: welcomeMsg, wt: waitingMsg, sp: systemPrompt,
            am: aiModel, ki: kbId, cr: contextRounds,
            ne: notifyEnabled, nu: notifyUserids
          }));
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 2500);
        } else toast.error(d.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* 渠道启用/停用开关 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">渠道状态</div>
            <div className="text-xs text-gray-400 mt-0.5">{isEnabled ? "已启用，AI 正在接收消息" : "已停用，AI 不会回复消息"}</div>
          </div>
          <button
            onClick={handleToggleEnabled}
            disabled={togglingEnabled}
            className="flex items-center gap-2 disabled:opacity-50"
          >
            {togglingEnabled
              ? <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
              : isEnabled
                ? <ToggleRight className="w-16 h-16 text-green-500" />
                : <ToggleLeft className="w-16 h-16 text-gray-300" />
            }
          </button>
        </div>
      </div>

      {/* 欢迎语 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">欢迎语</label>
        <p className="text-xs text-gray-400 mb-2">用户首次发消息时自动回复，留空则不发送</p>
        <textarea
          value={welcomeMsg}
          onChange={e => setWelcomeMsg(e.target.value)}
          placeholder="输入欢迎语，支持换行"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-800 placeholder-gray-400"
        />
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">等待提示语</label>
        <p className="text-xs text-gray-400 mb-2">用户发消息后、AI 回复前显示的提示，避免用户以为没反应</p>
        <input
          value={waitingMsg}
          onChange={e => setWaitingMsg(e.target.value)}
          placeholder="例如：收到，AI 正在思考中，请稍候..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* 全局 System Prompt */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">全局 AI 指令（System Prompt）</label>
        <p className="text-xs text-gray-400 mb-2">对所有用户生效的 AI 行为约束，留空则不限制</p>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="例如：你是一名专业助手，请不要透露你使用的是哪个大模型..."
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-800 placeholder-gray-400"
        />
      </div>

      {/* AI 辅助指令知识库维护 — 可折叠卡片 */}
      <AiAssistConfigCard
        channelId={channel.id}
        kbId={kbId}
        systemPrompt={systemPrompt}
        onApplyPrompt={(addition) => setSystemPrompt(prev => prev ? prev + '\n' + addition : addition)}
      />

      {/* AI 模型选择（客服账号显示，自建应用用路由） */}
      {!isApp && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">默认 AI 模型</label>
          <div className="grid grid-cols-1 gap-2">
            {CHANNEL_AI_MODELS.map(m => (
              <button
                key={m.value}
                onClick={() => setAiModel(m.value)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${
                  aiModel === m.value
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-gray-400">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 自建应用：AI 智能路由 */}
      {isApp && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">AI 智能路由</label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-700">智能路由开关</div>
                <div className="text-xs text-gray-400">开启后系统自动判断每条消息派给哪个模型</div>
              </div>
              <button onClick={() => setRouteEnabled(!routeEnabled)}>
                {routeEnabled
                  ? <ToggleRight className="w-8 h-8 text-blue-500" />
                  : <ToggleLeft className="w-8 h-8 text-gray-400" />}
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <div>
                <div className="text-sm text-gray-700">前置分类模型</div>
                <div className="text-xs text-gray-400">判断消息应派给谁，建议轻量级</div>
              </div>
              <select
                value={classifierModel}
                onChange={e => setClassifierModel(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                <option value="deepseek-chat">DeepSeek Flash（推荐）</option>
                <option value="deepseek-v4-pro">DeepSeek Pro</option>
                <option value="manus-1.6-lite">Manus 轻量（推荐）</option>
                <option value="manus-1.6">Manus 标准</option>
                <option value="manus-1.6-max">Manus Max</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <div>
                <div className="text-sm text-gray-700">兜底模型</div>
                <div className="text-xs text-gray-400">分类失败时使用</div>
              </div>
              <select
                value={fallbackModel}
                onChange={e => setFallbackModel(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                <option value="deepseek-chat">DeepSeek Flash</option>
                <option value="deepseek-v4-pro">DeepSeek Pro</option>
                <option value="manus-1.6-lite">Manus 轻量</option>
                <option value="manus-1.6">Manus 标准</option>
                <option value="manus-1.6-max">Manus Max</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 会话上下文轮数 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">会话上下文轮数</label>
          <span className="text-sm font-bold text-blue-600">{contextRounds} 轮</span>
        </div>
        <p className="text-xs text-gray-400 mb-3">AI 记忆多少轮对话历史，数值越大越消耗积分（建议 5-20）</p>
        <input
          type="range"
          min={1}
          max={50}
          value={contextRounds}
          onChange={e => setContextRounds(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-300 mt-1">
          <span>1轮（省积分）</span>
          <span>50轮（强记忆）</span>
        </div>
      </div>

      {/* 绑定知识库（客服账号） */}
      {!isApp && kbList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">绑定知识库</label>
          <div className="space-y-2">
            <button
              onClick={() => setKbId(0)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${
                kbId === 0 ? "border-gray-400 bg-gray-50 text-gray-700" : "border-gray-200 text-gray-500"
              }`}
            >
              不绑定知识库
            </button>
            {kbList.map(kb => (
              <button
                key={kb.id}
                onClick={() => setKbId(kb.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${
                  kbId === kb.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"
                }`}
              >
                <div className="font-medium">{kb.name}</div>
                {kb.description && <div className="text-xs text-gray-400 mt-0.5">{kb.description}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{kb.item_count} 条记录</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息抄送（仅微信客服渠道） */}
      {!isApp && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">消息抄送通知</div>
              <div className="text-xs text-gray-400 mt-0.5">AI 回复客户后，同步抷送一份给指定成员的企业微信</div>
            </div>
            <button onClick={() => setNotifyEnabled(v => !v)}>
              {notifyEnabled
                ? <ToggleRight className="w-8 h-8 text-blue-500" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            </button>
          </div>
          {notifyEnabled && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-1">选择抄送接收人（可多选）</div>
              {memberLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 className="w-3 h-3 animate-spin" />加载成员列表...
                </div>
              ) : memberList.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {memberList.map(m => (
                    <button
                      key={m.userid}
                      onClick={() => setNotifyUserids(prev =>
                        prev.includes(m.userid)
                          ? prev.filter(id => id !== m.userid)
                          : [...prev, m.userid]
                      )}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                        notifyUserids.includes(m.userid)
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <span>{m.name}</span>
                      <span className="text-xs text-gray-400">{m.userid}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-amber-500 bg-amber-50 rounded-lg px-3 py-2">成员列表加载失败（IP白名单限制），请手动输入 userid</div>
                  <input
                    value={notifyUserids.join(',')}
                    onChange={e => setNotifyUserids(e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}
                    placeholder="输入 userid，多个用英文逗号分隔，例如：HuXX,ZhangXX"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              )}
              {notifyUserids.length > 0 && (
                <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-1">
                  已选 {notifyUserids.length} 人接收抄送：{notifyUserids.join('、')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 菜单回复模板（自建应用） */}
      {isApp && menuKeys.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1 h-4 bg-blue-500 rounded-full" />
            <span className="text-sm font-medium text-gray-800">菜单自动回复模板</span>
          </div>
          {menuKeys.map(item => (
            <div key={item.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-gray-700">{item.name}</div>
                  <div className="text-xs text-gray-400">{item.desc}</div>
                </div>
                {!editingReplies[item.key] ? (
                  <button
                    onClick={() => setEditingReplies(v => ({ ...v, [item.key]: true }))}
                    className="text-xs text-blue-500 border border-blue-200 rounded px-2 py-1"
                  >
                    编辑
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingReplies(v => ({ ...v, [item.key]: false }))}
                      className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1"
                    >
                      取消
                    </button>
                    <button
                      disabled={savingReplies[item.key]}
                      onClick={async () => {
                        setSavingReplies(v => ({ ...v, [item.key]: true }));
                        try {
                          const res = await fetch("/api/wecom/route-config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ config: { [`menu_reply_${item.key}`]: menuReplies[item.key] || "" } }),
                          });
                          const d = await res.json();
                          if (d.ok) { toast.success(`「${item.name}」已保存`); setEditingReplies(v => ({ ...v, [item.key]: false })); }
                          else toast.error(d.error || "保存失败");
                        } catch { toast.error("保存失败"); }
                        finally { setSavingReplies(v => ({ ...v, [item.key]: false })); }
                      }}
                      className="text-xs text-white bg-blue-600 rounded px-2 py-1 disabled:opacity-50"
                    >
                      {savingReplies[item.key] ? "..." : "保存"}
                    </button>
                  </div>
                )}
              </div>
              {editingReplies[item.key] ? (
                <textarea
                  id={`menu-reply-ta-${item.key}`}
                  value={menuReplies[item.key] || ""}
                  onChange={e => setMenuReplies(prev => ({ ...prev, [item.key]: e.target.value }))}
                  placeholder="输入回复内容，留空使用默认回复"
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 whitespace-pre-wrap min-h-[40px]">
                  {menuReplies[item.key] || "（使用默认回复）"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 保存按钮：带脏数据检测和正反馈 */}
      {(() => {
        const currentSnap = !isApp ? JSON.stringify({
          wm: welcomeMsg, wt: waitingMsg, sp: systemPrompt,
          am: aiModel, ki: kbId, cr: contextRounds,
          ne: notifyEnabled, nu: notifyUserids
        }) : null;
        const isDirty = isApp || (savedSnapshot === "" || currentSnap !== savedSnapshot);
        return (
          <button
            onClick={handleSave}
            disabled={saving || justSaved || (!isApp && !isDirty)}
            className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              saving ? 'bg-blue-400 text-white opacity-80'
              : justSaved ? 'bg-green-500 text-white'
              : isDirty ? 'bg-blue-600 text-white active:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
            ) : justSaved ? (
              <><Check className="w-4 h-4" />已保存</>
            ) : (
              <><Save className="w-4 h-4" />{isDirty ? '保存配置' : '配置未更改'}</>
            )}
          </button>
        );
      })()}
    </div>
  );
}

// ─── 专属规则Tab ───────────────────────────────────────────────────────────────

function ChannelCustomRulesTab({ channelType }: { channelType: string }) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [wecomUsers2, setWecomUsers2] = useState<WecomUserForRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [form, setForm] = useState({
    rule_name: "",
    trigger_intent: "",
    reply_mode: "ai" as "template" | "ai",
    template_text: "",
    ai_model: "deepseek-chat",
    ai_system_prompt: "",
    target_type: "selected" as "all" | "selected",
    selected_user_ids: [] as string[],
  });

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wecom/custom-rules?channel_type=${channelType}`);
      const d = await res.json();
      if (d.ok) setRules(d.rules || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  };

  const loadUsers2 = async () => {
    try {
      const res = await fetch("/api/wecom/users");
      const d = await res.json();
      if (d.ok) setWecomUsers2(d.users || []);
    } catch {}
  };

  useEffect(() => { loadRules(); loadUsers2(); }, [channelType]);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ rule_name: "", trigger_intent: "", reply_mode: "ai", template_text: "", ai_model: "deepseek-chat", ai_system_prompt: "", target_type: "selected", selected_user_ids: [] });
    setShowModal(true);
  };

  const openEdit = (rule: CustomRule) => {
    setEditingRule(rule);
    let ids: string[] = [];
    try { ids = JSON.parse(rule.target_user_ids || "[]"); } catch {}
    setForm({
      rule_name: rule.rule_name,
      trigger_intent: rule.trigger_intent,
      reply_mode: rule.reply_mode,
      template_text: rule.template_text || "",
      ai_model: rule.ai_model || "deepseek-chat",
      ai_system_prompt: rule.ai_system_prompt || "",
      target_type: rule.target_type,
      selected_user_ids: ids,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.rule_name.trim()) { toast.error("请输入规则名称"); return; }
    if (!form.trigger_intent.trim()) { toast.error("请输入触发意图描述"); return; }
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
        target_user_ids: form.target_type === "all" ? [] : form.selected_user_ids,
        channel_type: channelType,
        enabled: 1,
      };
      let res;
      if (editingRule) {
        res = await fetch(`/api/wecom/custom-rules/${editingRule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch("/api/wecom/custom-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const d = await res.json();
      if (d.ok) { toast.success("保存成功"); setShowModal(false); loadRules(); }
      else toast.error(d.error || "保存失败");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  const handleToggle = async (rule: CustomRule) => {
    try {
      const res = await fetch(`/api/wecom/custom-rules/${rule.id}/toggle`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !rule.enabled }) });
      const d = await res.json();
      if (d.ok) { toast.success(rule.enabled ? "已停用" : "已启用"); loadRules(); }
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/wecom/custom-rules/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success("已删除"); setDeleteConfirm(null); loadRules(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  };

  const toggleUserSelect = (uid: string) => {
    setForm(prev => ({
      ...prev,
      selected_user_ids: prev.selected_user_ids.includes(uid)
        ? prev.selected_user_ids.filter(id => id !== uid)
        : [...prev.selected_user_ids, uid],
    }));
  };

  const filteredRules = rules.filter(r => r.rule_name.includes(search) || r.trigger_intent.includes(search));
  const enabledCount = rules.filter(r => r.enabled).length;
  const totalTriggers = rules.reduce((s, r) => s + (r.trigger_count || 0), 0);

  return (
    <div className="space-y-3 pb-6">
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
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
        />
        <button onClick={openCreate} className="flex items-center gap-1 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg">
          <Plus className="w-4 h-4" />新建
        </button>
      </div>

      {/* 规则列表 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
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
            try { userIds = JSON.parse(rule.target_user_ids || "[]"); } catch {}
            const targetUsers = wecomUsers2.filter(u => userIds.includes(u.wecom_user_id));
            return (
              <div key={rule.id} className={`bg-white rounded-xl border p-3 ${rule.enabled ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? "bg-green-400" : "bg-gray-300"}`} />
                      <span className="text-sm font-medium text-gray-800 truncate">{rule.rule_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${rule.reply_mode === "template" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
                        {rule.reply_mode === "template" ? "固定模板" : "AI回复"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 line-clamp-2">{rule.trigger_intent}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {rule.target_type === "all" ? (
                        <span className="text-xs text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">全部用户</span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {targetUsers.length > 0
                            ? targetUsers.slice(0, 3).map(u => u.nickname).join("、") + (targetUsers.length > 3 ? `等${targetUsers.length}人` : "")
                            : `${userIds.length}个用户`}
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
                      className={`text-xs border rounded px-2 py-1 ${rule.enabled ? "text-gray-500 border-gray-200" : "text-green-600 border-green-200"}`}
                    >
                      {rule.enabled ? "停用" : "启用"}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-gray-800">{editingRule ? "编辑规则" : "新建专属规则"}</span>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">规则名称 <span className="text-red-400">*</span></label>
                <input
                  value={form.rule_name}
                  onChange={e => setForm(p => ({ ...p, rule_name: e.target.value }))}
                  placeholder="如：世界杯赔率查询"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                />
              </div>
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
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">回复模式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, reply_mode: "template" }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${form.reply_mode === "template" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500"}`}
                  >
                    固定模板回复
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, reply_mode: "ai" }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${form.reply_mode === "ai" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}
                  >
                    专属 AI 回复
                  </button>
                </div>
              </div>
              {form.reply_mode === "template" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">回复内容</label>
                  <Textarea
                    value={form.template_text}
                    onChange={e => setForm(p => ({ ...p, template_text: e.target.value }))}
                    placeholder="输入固定回复内容"
                    className="text-sm min-h-[100px] resize-none font-mono"
                  />
                </div>
              )}
              {form.reply_mode === "ai" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">指定模型</label>
                    <div className="space-y-1.5">
                      {RULE_MODELS.map(m => (
                        <button
                          key={m.value}
                          onClick={() => setForm(p => ({ ...p, ai_model: m.value }))}
                          className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-all ${form.ai_model === m.value ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">专属 System Prompt</label>
                    <Textarea
                      value={form.ai_system_prompt}
                      onChange={e => setForm(p => ({ ...p, ai_system_prompt: e.target.value }))}
                      placeholder="告诉 AI 用什么格式、查什么内容回答"
                      className="text-sm min-h-[120px] resize-none"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">适用用户</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setForm(p => ({ ...p, target_type: "selected" }))}
                    className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${form.target_type === "selected" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}
                  >
                    指定用户
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, target_type: "all" }))}
                    className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${form.target_type === "all" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500"}`}
                  >
                    全部用户
                  </button>
                </div>
                {form.target_type === "selected" && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {wecomUsers2.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-4">暂无企微用户</div>
                    ) : wecomUsers2.map(u => (
                      <div
                        key={u.wecom_user_id}
                        onClick={() => toggleUserSelect(u.wecom_user_id)}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${form.selected_user_ids.includes(u.wecom_user_id) ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.selected_user_ids.includes(u.wecom_user_id) ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
                          {form.selected_user_ids.includes(u.wecom_user_id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="w-7 h-7 rounded-full" alt="" />
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
                {form.target_type === "selected" && form.selected_user_ids.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">已选 {form.selected_user_ids.length} 个用户</div>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "保存中..." : "保存规则"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 知识库Tab（共用） ─────────────────────────────────────────────────────────

function ChannelKnowledgeTab({ channelType }: { channelType: string }) {
  const [stats, setStats] = useState<{ kb_count: number; item_count: number; file_count: number; char_count: number }>({ kb_count: 0, item_count: 0, file_count: 0, char_count: 0 });
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<"qa" | "doc">("qa");
  const [addQuestion, setAddQuestion] = useState("");
  const [addSimilar, setAddSimilar] = useState(""); // 相似问法
  const [addAnswer, setAddAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteSource, setDeleteSource] = useState<string | null>(null);
  const [viewSource, setViewSource] = useState<string | null>(null);
  const [sourceItems, setSourceItems] = useState<KnowledgeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [s, src] = await Promise.all([
        fetch(`/api/wecom/ch/kb/stats?channel_type=${channelType}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/sources?channel_type=${channelType}`).then(r => r.json()),
      ]);
      if (s.ok) setStats(s);
      if (src.ok) setSources(src.sources || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [channelType]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("channel_type", channelType);
      const res = await fetch("/api/wecom/ch/kb/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) { toast.success(`导入成功，新增 ${d.imported} 条`); loadData(); }
      else toast.error(d.error || "导入失败");
    } catch { toast.error("上传失败"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/export?channel_type=${channelType}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `knowledge_${channelType}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  }

  async function handleAddItem() {
    if (!addAnswer.trim()) { toast.error("请输入内容"); return; }
    setSaving(true);
    try {
      // 将相似问法合并进 question 字段（换行分隔），与上传接口保持一致
      let finalQuestion = addType === "qa" ? addQuestion.trim() : null;
      if (finalQuestion && addSimilar.trim()) {
        finalQuestion += "\n" + addSimilar.trim();
      }
      const res = await fetch("/api/wecom/ch/kb/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_type: channelType,
          question: finalQuestion || null,
          answer: addAnswer,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("添加成功");
        setShowAddModal(false);
        setAddQuestion(""); setAddSimilar(""); setAddAnswer("");
        loadData();
      } else toast.error(d.error || "添加失败");
    } catch { toast.error("网络错误"); }
    finally { setSaving(false); }
  }

  async function handleDeleteSource(sourceFile: string) {
    try {
      const res = await fetch(`/api/wecom/ch/kb/source?channel_type=${channelType}&source_file=${encodeURIComponent(sourceFile)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteSource(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function openSourceDetail(sourceFile: string) {
    setViewSource(sourceFile);
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/items?channel_type=${channelType}&source_file=${encodeURIComponent(sourceFile)}`);
      const d = await res.json();
      if (d.ok) setSourceItems(d.items || []);
    } catch { toast.error("加载失败"); }
    finally { setLoadingItems(false); }
  }

  function fmtChars(n: number) {
    if (n >= 10000) return (n / 10000).toFixed(1) + "万";
    return String(n);
  }

  // 来源文件详情视图
  if (viewSource) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setViewSource(null)} className="p-1.5 rounded-lg bg-gray-100 text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{viewSource}</div>
            <div className="text-xs text-gray-400">{sourceItems.length} 条记录</div>
          </div>
        </div>
        {loadingItems ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : sourceItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无内容</div>
        ) : (
          <div className="space-y-2">
            {sourceItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${item.item_type === "qa" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                    {item.item_type === "qa" ? "问答" : "段落"}
                  </span>
                  {item.chunk_index != null && <span className="text-xs text-gray-400">第{item.chunk_index + 1}段</span>}
                </div>
                {item.question && <div className="text-sm font-medium text-gray-700 mb-1">Q: {item.question}</div>}
                <div className="text-sm text-gray-500 line-clamp-3">{item.item_type === "qa" ? "A: " : ""}{item.answer}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 数据看板 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.item_count}</div>
          <div className="text-xs text-gray-400 mt-0.5">知识条数</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 text-center">
          <div className="text-lg font-bold text-green-600">{stats.file_count}</div>
          <div className="text-xs text-gray-400 mt-0.5">来源文件</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-3 text-center">
          <div className="text-lg font-bold text-purple-600">{fmtChars(stats.char_count)}</div>
          <div className="text-xs text-gray-400 mt-0.5">总字数</div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1 bg-blue-600 text-white text-xs py-2.5 rounded-xl font-medium disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {uploading ? "导入中" : "上传文件"}
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-1 bg-white border border-gray-200 text-gray-700 text-xs py-2.5 rounded-xl font-medium"
        >
          <Plus className="w-3.5 h-3.5" />手动新增
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center justify-center gap-1 bg-white border border-gray-200 text-gray-700 text-xs py-2.5 rounded-xl font-medium disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5 rotate-90" />}
          导出
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt"
        onChange={handleFileUpload}
        className="hidden"
      />
      <div className="text-xs text-gray-400 px-1 leading-relaxed">
        支持 Excel / CSV（问答对）、PDF / Word / TXT（自动切片）。文件上传后自动转入知识库供 AI 检索。
      </div>

      {/* 来源文件列表 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">暂无知识内容，点击「上传文件」或「手动新增」</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 px-1">知识来源（共 {sources.length} 个）</div>
          {sources.map((s, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.item_type === "qa" ? "bg-blue-50" : "bg-green-50"}`}>
                <Shield className={`w-4 h-4 ${s.item_type === "qa" ? "text-blue-500" : "text-green-500"}`} />
              </div>
              <button onClick={() => openSourceDetail(s.source_file)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-gray-800 truncate">{s.source_file}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.item_count} 条 · {formatShortDate(s.imported_at)}</div>
              </button>
              {deleteSource === s.source_file ? (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => handleDeleteSource(s.source_file)} className="text-xs text-white bg-red-500 rounded px-1.5 py-1">确删</button>
                  <button onClick={() => setDeleteSource(null)} className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-1">取消</button>
                </div>
              ) : (
                <button onClick={() => setDeleteSource(s.source_file)} className="text-xs text-red-400 border border-red-100 rounded px-2 py-1 flex-shrink-0">删除</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 手动新增弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-gray-800">手动新增知识</span>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">问题</label>
                <input value={addQuestion} onChange={e => setAddQuestion(e.target.value)} placeholder="输入问题（可选）" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">相似问法 <span className="text-gray-400 font-normal">（可选，多个用换行分隔）</span></label>
                <Textarea value={addSimilar} onChange={e => setAddSimilar(e.target.value)} placeholder="例如：&#10;这个怎么用&#10;使用方法是什么" className="text-sm min-h-[80px] resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">答案 <span className="text-red-400">*</span></label>
                <Textarea value={addAnswer} onChange={e => setAddAnswer(e.target.value)} placeholder="输入答案内容" className="text-sm min-h-[120px] resize-none" />
              </div>
              <button onClick={handleAddItem} disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "添加中..." : "添加到知识库"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 用户Tab ──────────────────────────────────────────────────────────────────

function ChannelUsersTab({ channelType }: { channelType: string }) {
  const [users, setUsers] = useState<ChannelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockConfirm, setBlockConfirm] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/wecom/ch/users?channel_type=${channelType}`);
      const d = await res.json();
      if (d.ok) setUsers(d.users || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadUsers(); }, [channelType]);

  async function handleBlock(userId: string, block: boolean) {
    try {
      const res = await fetch(`/api/wecom/ch/users/${block ? "block" : "unblock"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wecom_user_id: userId, channel_type: channelType }),
      });
      const d = await res.json();
      if (d.ok) { toast.success(block ? "已拉黑" : "已解除拉黑"); setBlockConfirm(null); loadUsers(); }
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 px-1">共 {users.length} 位用户</div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">暂无用户记录</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.wecom_user_id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 ${u.blocked ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-3">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{u.nickname || u.wecom_user_id}</span>
                    {u.blocked && <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">已拉黑</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{u.msg_count} 条消息</span>
                    <span className="text-xs text-gray-400">{u.total_credits || 0} 积分</span>
                    <span className="text-xs text-gray-400">最近：{formatShortDate(u.last_active)}</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {u.blocked ? (
                    <button
                      onClick={() => handleBlock(u.wecom_user_id, false)}
                      className="text-xs text-green-600 border border-green-200 rounded px-2 py-1"
                    >
                      解除
                    </button>
                  ) : blockConfirm === u.wecom_user_id ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleBlock(u.wecom_user_id, true)} className="text-xs text-white bg-red-500 rounded px-1.5 py-1">确认拉黑</button>
                      <button onClick={() => setBlockConfirm(null)} className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-1">取消</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setBlockConfirm(u.wecom_user_id)}
                      className="text-xs text-red-400 border border-red-100 rounded px-2 py-1"
                    >
                      <Ban className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 对话日志Tab ──────────────────────────────────────────────────────────────

function ChannelLogsTab({ channelType }: { channelType: string }) {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userId, setUserId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [model, setModel] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // AI分析弹窗
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [kbSuggestions, setKbSuggestions] = useState<{ question: string; answer: string; similar_questions?: string }[] | null>(null);
  const [analyzeMode, setAnalyzeMode] = useState<string>("");
  const [showAnalyzeSheet, setShowAnalyzeSheet] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [adoptingIdx, setAdoptingIdx] = useState<number | null>(null);

  function buildParams() {
    const params = new URLSearchParams();
    params.set("channel_type", channelType);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (userId.trim()) params.set("user_id", userId.trim());
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (model) params.set("model", model);
    return params;
  }

  async function fetchLogs(p = 0) {
    setLoading(true);
    try {
      const params = buildParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(p * PAGE_SIZE));
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) { setLogs(data.logs); setTotal(data.total || 0); setPage(p); }
      else toast.error(data.error || "加载失败");
    } catch { toast.error("网络错误"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchLogs(0); }, [channelType]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleSelect(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()); }

  function getSelectedLogs() {
    return logs.filter(l => selected.has(l.id)).map(l => ({ user_message: l.user_message, reply_preview: l.reply_preview }));
  }

  async function handleExport(format: "csv" | "json") {
    try {
      const params = buildParams();
      params.set("format", format);
      const res = await fetch(`/api/wecom/ch/logs/export?${params.toString()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `logs_${channelType}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch { toast.error("导出失败"); }
  }

  async function runAnalyze(mode: string) {
    const sel = getSelectedLogs();
    if (sel.length === 0) { toast.error("请先选择对话"); return; }
    setAnalyzeMode(mode);
    setShowAnalyzeSheet(false);
    setAnalyzing(true);
    setAnalyzeResult(null);
    setKbSuggestions(null);
    try {
      const res = await fetch("/api/wecom/ch/logs/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, logs: sel, custom_prompt: customPrompt }),
      });
      const d = await res.json();
      if (d.ok) {
        if (mode === "kb") setKbSuggestions((d.suggestions || []).length ? d.suggestions : [{ question: "", answer: d.raw || "" }]);
        else setAnalyzeResult(d.result || "");
      } else toast.error(d.error || "分析失败");
    } catch { toast.error("分析失败"); }
    finally { setAnalyzing(false); }
  }

  async function adoptSuggestion(idx: number) {
    if (!kbSuggestions) return;
    const s = kbSuggestions[idx];
    if (!s.answer.trim()) { toast.error("答案不能为空"); return; }
    setAdoptingIdx(idx);
    try {
      const res = await fetch("/api/wecom/ch/kb/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_type: channelType, question: s.question, similar_questions: s.similar_questions || "", answer: s.answer }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("已写入知识库");
        const next = kbSuggestions.filter((_, i) => i !== idx);
        setKbSuggestions(next.length ? next : null);
      } else toast.error(d.error || "采纳失败");
    } catch { toast.error("采纳失败"); }
    finally { setAdoptingIdx(null); }
  }

  function updateSuggestion(idx: number, field: "question" | "answer", val: string) {
    if (!kbSuggestions) return;
    const next = [...kbSuggestions];
    next[idx] = { ...next[idx], [field]: val };
    setKbSuggestions(next);
  }

  return (
    <div className="space-y-3">
      {/* 顶部操作栏 */}
      {!selectMode ? (
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilter(v => !v)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600">
            <BarChart2 className="w-3.5 h-3.5" />筛选
          </button>
          <button onClick={() => setSelectMode(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600">
            <Check className="w-3.5 h-3.5" />多选
          </button>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">共 {total} 条</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
          <span className="text-xs font-medium text-blue-700">已选 {selected.size} 条</span>
          <div className="flex-1" />
          <button onClick={() => setShowAnalyzeSheet(true)} disabled={selected.size === 0} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40">
            <Sparkles className="w-3.5 h-3.5" />AI分析
          </button>
          <button onClick={() => handleExport("csv")} disabled={selected.size === 0} className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-40">导出</button>
          <button onClick={exitSelectMode} className="text-xs px-2.5 py-1.5 rounded-lg text-gray-500">取消</button>
        </div>
      )}

      {/* 筛选面板 */}
      {showFilter && !selectMode && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400" />
            <span className="text-gray-400 self-center text-sm">至</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400" />
          </div>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="用户ID / 昵称" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="关键词（搜索消息内容）" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400" />
          <div className="flex gap-2">
            <select value={model} onChange={e => setModel(e.target.value)} className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 bg-white">
              <option value="">全部模型</option>
              <option value="deepseek-chat">DeepSeek Flash</option>
              <option value="deepseek-reasoner">DeepSeek R1</option>
              <option value="manus-1.6-lite">Manus 轻量</option>
              <option value="manus-1.6">Manus 标准</option>
            </select>
            <button onClick={() => { fetchLogs(0); setShowFilter(false); }} className="flex-shrink-0 text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white font-medium">查询</button>
          </div>
        </div>
      )}

      {/* 日志列表 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无对话日志</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              onClick={() => selectMode && toggleSelect(log.id)}
              className={`bg-white rounded-xl border shadow-sm p-4 transition-colors ${
                selectMode ? "cursor-pointer " + (selected.has(log.id) ? "border-blue-400 bg-blue-50/40" : "border-gray-100") : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {selectMode && (
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.has(log.id) ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                    {selected.has(log.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                )}
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-gray-700">{log.nickname || log.wecom_user_id}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(log.created_at)}</span>
              </div>
              <div className="text-sm text-gray-800 mb-1.5 leading-relaxed">
                <span className="text-xs text-gray-400 mr-1">问：</span>{log.user_message}
              </div>
              {log.reply_preview && (
                <div className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                  <span className="text-xs text-gray-400 mr-1">答：</span>{log.reply_preview}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
                {log.model_used && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{log.model_used}</span>}
                {log.credits_used > 0 && <span className="text-xs text-gray-400">{log.credits_used} 积分</span>}
                {!selectMode && (
                  <button
                    onClick={() => { setSelectMode(true); setSelected(new Set([log.id])); setShowAnalyzeSheet(true); }}
                    className="ml-auto flex items-center gap-1 text-xs text-purple-600"
                  >
                    <Sparkles className="w-3 h-3" />AI分析
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!selectMode && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button onClick={() => fetchLogs(page - 1)} disabled={page === 0 || loading} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40">上一页</button>
          <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
          <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages - 1 || loading} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40">下一页</button>
        </div>
      )}

      {/* AI分析选项底部弹窗 */}
      {showAnalyzeSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setShowAnalyzeSheet(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-4 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="text-center text-sm font-medium text-gray-800 mb-2">AI 分析（已选 {selected.size} 条）</div>
            <button onClick={() => runAnalyze("qc")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 text-left">
              <Shield className="w-5 h-5 text-blue-500" />
              <div><div className="text-sm font-medium text-gray-800">AI质检</div><div className="text-xs text-gray-500">分析对话质量好不好</div></div>
            </button>
            <button onClick={() => runAnalyze("optimize")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-50 text-left">
              <Zap className="w-5 h-5 text-amber-500" />
              <div><div className="text-sm font-medium text-gray-800">一键优化</div><div className="text-xs text-gray-500">找出问题并给改进建议</div></div>
            </button>
            <button onClick={() => runAnalyze("kb")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-green-50 text-left">
              <Plus className="w-5 h-5 text-green-500" />
              <div><div className="text-sm font-medium text-gray-800">知识库推荐</div><div className="text-xs text-gray-500">生成问答对，编辑后一键入库</div></div>
            </button>
            <button onClick={() => setShowAnalyzeSheet(false)} className="w-full py-2.5 text-sm text-gray-500">取消</button>
          </div>
        </div>
      )}

      {/* AI分析结果弹窗 */}
      {(analyzing || analyzeResult !== null || kbSuggestions !== null) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-gray-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-500" />
                {analyzeMode === "qc" ? "AI质检结果" : analyzeMode === "optimize" ? "优化建议" : "知识库推荐"}
              </span>
              <button onClick={() => { setAnalyzeResult(null); setKbSuggestions(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-4 py-4">
              {analyzing ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-sm text-gray-400">AI 正在分析...</span>
                </div>
              ) : kbSuggestions !== null ? (
                kbSuggestions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">已全部处理完毕</div>
                ) : (
                  <div className="space-y-4">
                    {kbSuggestions.map((s, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">问题（可编辑）</label>
                          <input value={s.question} onChange={e => updateSuggestion(idx, "question", e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">答案（可编辑）</label>
                          <Textarea value={s.answer} onChange={e => updateSuggestion(idx, "answer", e.target.value)} className="text-sm min-h-[90px] resize-none" />
                        </div>
                        <button onClick={() => adoptSuggestion(idx)} disabled={adoptingIdx === idx} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {adoptingIdx === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          采纳入库
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{analyzeResult}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
