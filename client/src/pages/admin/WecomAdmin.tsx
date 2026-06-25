import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, Trash2, Edit2, Plus, Check, X, Bot, Bell,
  Zap, MessageSquare, User, BarChart2, Menu, ChevronRight, ChevronDown,
  Clock, Settings, AlertCircle, PlayCircle, StopCircle, Coins, Loader2,
  Sparkles, Save, ToggleLeft, ToggleRight, Ban, Shield, Camera, Pencil, ImageIcon, FileText,
  FolderPlus, Library, ArrowRight
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import WecomBindingManager from "./WecomBindingManager";
import WecomRoutePanel from "@/components/WecomRoutePanel";
import { NutritionClubPage } from "./ProjectLanding";

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
  site_username?: string | null;
  site_user_id?: number | null;
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

type TabKey = "binding" | "users" | "workflow" | "messages" | "stats" | "menu" | "channel" | "docs" | "notify";

// Link2 图标内联引入
const Link2Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "binding", label: "用户绑定", icon: <Link2Icon /> },
  { key: "users", label: "客服用户", icon: <User className="w-4 h-4" /> },
  { key: "workflow", label: "工作流", icon: <Zap className="w-4 h-4" /> },
  { key: "messages", label: "消息", icon: <MessageSquare className="w-4 h-4" /> },
  { key: "stats", label: "统计", icon: <BarChart2 className="w-4 h-4" /> },
  { key: "menu", label: "菜单", icon: <Menu className="w-4 h-4" /> },
  { key: "channel", label: "渠道", icon: <Settings className="w-4 h-4" /> },
  { key: "docs", label: "文档", icon: <FileText className="w-4 h-4" /> },
  { key: "notify", label: "通知平台", icon: <Bell className="w-4 h-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════════

export default function WecomAdmin() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("binding");

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      {/* Tab 内容 */}
      <div className="pt-2">
        {activeTab === "binding" && <WecomBindingManager />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "messages" && <MessagesTab />}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "menu" && <MenuTab />}
        {activeTab === "channel" && <ChannelTab />}
        {activeTab === "docs" && <DocsTab />}
        {activeTab === "notify" && <NotifyTab />}
      </div>

      {/* 底部 Tab 栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 max-w-md mx-auto">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center py-3 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-[#1a5c2e] border-t-2 border-[#1a5c2e]'
                  : 'text-gray-400 border-t-2 border-transparent'
              }`}
            >
              {tab.label}
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
  const [viewMode, setViewMode] = useState<'user' | 'time' | 'ai' | 'logs' | 'api_usage'>('user');
  // 对话记录明细状态
  const [platLogs, setPlatLogs] = useState<any[]>([]);
  const [platLogsTotal, setPlatLogsTotal] = useState(0);
  const [platLogsTotalTokens, setPlatLogsTotalTokens] = useState(0);
  const [platLogsPage, setPlatLogsPage] = useState(0);
  const [platLogsLoading, setPlatLogsLoading] = useState(false);
  const [platChannels, setPlatChannels] = useState<{id:number;name:string}[]>([]);
  const [platFilterChannel, setPlatFilterChannel] = useState<string>('all');
  const [platShowChannelDD, setPlatShowChannelDD] = useState(false);
  const [platExpandedLog, setPlatExpandedLog] = useState<number|null>(null);
  const PLAT_PAGE_SIZE = 30;
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

  // 加载全平台渠道列表
  useEffect(() => {
    fetch('/api/wecom/platform/channels').then(r => r.json()).then(d => {
      if (d.ok) setPlatChannels(d.channels || []);
    }).catch(() => {});
  }, []);

  // 加载全平台对话记录
  const fetchPlatLogs = useCallback(async (p = 0, channelId?: string) => {
    setPlatLogsLoading(true);
    try {
      const ch = channelId !== undefined ? channelId : platFilterChannel;
      const dr = getLocalDateRange(timeRange);
      const params = new URLSearchParams();
      if (ch && ch !== 'all') params.set('channel_id', ch);
      if (dr) { params.set('start_date', dr.start); params.set('end_date', dr.end); }
      if (selectedUsers.length > 0) params.set('user_id', selectedUsers[0]);
      if (aiModel !== 'all') params.set('model', aiModel);
      params.set('limit', String(PLAT_PAGE_SIZE));
      params.set('offset', String(p * PLAT_PAGE_SIZE));
      const res = await fetch(`/api/wecom/platform/logs?${params.toString()}`);
      const d = await res.json();
      if (d.ok) {
        setPlatLogs(d.logs || []);
        setPlatLogsTotal(d.total || 0);
        setPlatLogsTotalTokens(d.total_tokens || 0);
        setPlatLogsPage(p);
      }
    } catch {}
    finally { setPlatLogsLoading(false); }
  }, [platFilterChannel, timeRange, selectedUsers, aiModel]);

  useEffect(() => {
    if (viewMode === 'logs') fetchPlatLogs(0);
  }, [viewMode]);

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
          {(['user', 'time', 'ai', 'logs', 'api_usage'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode as any)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {mode === 'user' ? '按用户' : mode === 'time' ? '按时间' : mode === 'ai' ? 'AI汇总' : mode === 'logs' ? '对话记录' : 'API用量'}
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

      {/* 对话记录Tab：渠道筛选条 */}
      {viewMode === 'logs' && (
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <button
              onClick={() => setPlatShowChannelDD(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                platFilterChannel !== 'all' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              <span>{platFilterChannel === 'all' ? '全部渠道' : (platChannels.find(c => String(c.id) === platFilterChannel)?.name || '渠道' + platFilterChannel)}</span>
              <ChevronRight className={`w-3 h-3 transition-transform ${platShowChannelDD ? 'rotate-90' : ''}`} />
            </button>
            {platShowChannelDD && (
              <div className="absolute top-10 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-44 py-1">
                <button onClick={() => { setPlatFilterChannel('all'); setPlatShowChannelDD(false); fetchPlatLogs(0, 'all'); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${platFilterChannel === 'all' ? 'text-green-600 font-medium' : 'text-gray-700'}`}>全部渠道</button>
                {platChannels.map(c => (
                  <button key={c.id} onClick={() => { setPlatFilterChannel(String(c.id)); setPlatShowChannelDD(false); fetchPlatLogs(0, String(c.id)); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${platFilterChannel === String(c.id) ? 'text-green-600 font-medium' : 'text-gray-700'}`}>{c.name}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => fetchPlatLogs(0)} className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

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
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-r border-gray-200" style={{width:'10em',minWidth:'10em',maxWidth:'10em'}}>用户</th>
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
                    <td className="px-3 py-2.5 border-r border-gray-100" style={{width:'10em',minWidth:'10em',maxWidth:'10em'}}>
                      <div className="font-medium text-gray-900 text-sm truncate">{stat.nickname || stat.wecom_user_id}</div>
                      {stat.site_username
                        ? <div className="text-xs text-green-600 mt-0.5">脉动网：{stat.site_username}</div>
                        : <div className="text-xs text-gray-400 mt-0.5">未绑定脉动网</div>
                      }
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

      {/* 对话记录明细 */}
      {viewMode === 'logs' && (
        <div className="space-y-2">
          {/* 汇总卡片 */}
          <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-green-700">{platLogsTotal}</div>
              <div className="text-xs text-green-600">总条数</div>
            </div>
            <div className="w-px h-8 bg-green-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-green-700">{platLogsTotalTokens.toLocaleString()}</div>
              <div className="text-xs text-green-600">总 Tokens</div>
            </div>
          </div>
          {/* 加载中 */}
          {platLogsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>
          ) : platLogs.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">暂无对话记录</div>
          ) : (
            <div className="space-y-2">
              {platLogs.map(log => {
                const totalTok = (log.input_tokens || 0) + (log.output_tokens || 0) + (log.cache_hit_tokens || 0);
                const isExp = platExpandedLog === log.id;
                const chName = log.channel_name || (log.manus_task_id === 'kf-deepseek' ? '营养顾问' : log.channel_type);
                const dateStr = new Date(log.created_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                return (
                  <div key={log.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <button className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left"
                      onClick={() => setPlatExpandedLog(isExp ? null : log.id)}>
                      <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-xs font-semibold text-gray-800 truncate">{log.nickname || log.wecom_user_id?.slice(0,12)}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{dateStr}</span>
                        </div>
                        <div className="text-xs text-gray-700 line-clamp-1">{log.user_message || '(无内容)'}</div>
                        {log.reply_preview && !isExp && (
                          <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{log.reply_preview}</div>
                        )}
                      </div>
                      {isExp ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-1" />}
                    </button>
                    {/* 常显底部信息 */}
                    <div className="px-3 pb-2.5 pt-1.5 border-t border-gray-50 flex items-center gap-2 flex-wrap">
                      {log.model_used && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-600">{log.model_used}</span>}
                      <span className="text-[10px] text-gray-400">{totalTok > 0 ? `${totalTok.toLocaleString()} tokens` : `${log.credits_used || 0} credits`}</span>
                      {/* 星级评分 */}
                      {log.dialog_score != null ? (() => {
                        const stars = Math.round((log.dialog_score / 20) * 2) / 2;
                        const sc = stars >= 4.5 ? '#16a34a' : stars >= 3.5 ? '#2563eb' : stars >= 2.5 ? '#d97706' : '#dc2626';
                        return (
                          <div className="flex items-center gap-0.5 ml-auto">
                            {Array.from({length: 5}).map((_, i) => {
                              const filled = i < Math.floor(stars);
                              const half = !filled && i === Math.floor(stars) && stars % 1 >= 0.5;
                              return (
                                <svg key={i} className="w-3 h-3" viewBox="0 0 24 24">
                                  {half ? (
                                    <>
                                      <defs><linearGradient id={`pg${log.id}${i}`}><stop offset="50%" stopColor={sc}/><stop offset="50%" stopColor="#e5e7eb"/></linearGradient></defs>
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={`url(#pg${log.id}${i})`}/>
                                    </>
                                  ) : <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={filled ? sc : '#e5e7eb'}/>}
                                </svg>
                              );
                            })}
                            <span className="text-[10px] font-bold ml-0.5" style={{color:sc}}>{stars.toFixed(1)}</span>
                          </div>
                        );
                      })() : <span className="ml-auto text-[10px] text-gray-300">评分中…</span>}
                      {chName && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{backgroundColor:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0'}}>{chName}</span>}
                    </div>
                    {/* 展开详情 */}
                    {isExp && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mt-2">
                          <div className="font-medium text-gray-500 mb-1">用户问</div>
                          <div>{log.user_message}</div>
                        </div>
                        {log.reply_preview && (
                          <div className="text-xs text-gray-600 bg-green-50 rounded-lg p-2">
                            <div className="font-medium text-green-600 mb-1">AI 回复</div>
                            <div>{log.reply_preview}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center">
                          <div className="bg-gray-50 rounded-lg py-1.5">
                            <div className="font-bold text-gray-700">{(log.input_tokens || 0).toLocaleString()}</div>
                            <div className="text-gray-400">输入 tokens</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg py-1.5">
                            <div className="font-bold text-gray-700">{(log.output_tokens || 0).toLocaleString()}</div>
                            <div className="text-gray-400">输出 tokens</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg py-1.5">
                            <div className="font-bold text-gray-700">{(log.cache_hit_tokens || 0).toLocaleString()}</div>
                            <div className="text-gray-400">缓存命中</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 分页 */}
              {platLogsTotal > PLAT_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button disabled={platLogsPage === 0} onClick={() => fetchPlatLogs(platLogsPage - 1)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 disabled:opacity-40">&#8249; 上一页</button>
                  <span className="text-xs text-gray-500">{platLogsPage + 1} / {Math.ceil(platLogsTotal / PLAT_PAGE_SIZE)}</span>
                  <button disabled={(platLogsPage + 1) * PLAT_PAGE_SIZE >= platLogsTotal} onClick={() => fetchPlatLogs(platLogsPage + 1)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 disabled:opacity-40">下一页 &#8250;</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* API 用量详情 */}
      {viewMode === 'api_usage' && (
        <ApiUsageView />
      )}
    </div>
  );
}

// API 用量视图组件
const USE_CASE_LABELS: Record<string, string> = {
  chat_reply: '对话回复',
  rule_reply: '规则回复',
  ai_organize: 'AI辅助整理',
  image_ocr: '图片识别',
  embedding: '向量检索',
  voice_asr: '语音识别',
  classifier: '智能路由',
};
function ApiUsageView() {
  const [data, setData] = useState<{ by_scene: any[]; by_day: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/wecom/stats/api-usage')
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  if (!data || data.by_scene.length === 0) return (
    <div className="text-center py-12 text-gray-400 text-sm">
      <div className="text-3xl mb-2">📊</div>
      <div>暂无 API 用量记录</div>
      <div className="text-xs mt-1 text-gray-300">有 AI 调用后自动记录</div>
    </div>
  );

  const totalCalls = data.by_scene.reduce((s, r) => s + r.call_count, 0);
  const totalTokens = data.by_scene.reduce((s, r) => s + r.total_tokens, 0);
  const totalAudioSec = data.by_scene.reduce((s, r) => s + r.total_audio_seconds, 0);

  return (
    <div className="space-y-3">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{totalCalls.toLocaleString()}</div>
          <div className="text-xs text-blue-400 mt-0.5">总调用次数</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-700">{totalTokens >= 10000 ? (totalTokens / 10000).toFixed(1) + '万' : totalTokens.toLocaleString()}</div>
          <div className="text-xs text-purple-400 mt-0.5">总 Tokens</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-orange-700">{totalAudioSec >= 60 ? (totalAudioSec / 60).toFixed(1) + '分' : totalAudioSec + '秒'}</div>
          <div className="text-xs text-orange-400 mt-0.5">语音时长</div>
        </div>
      </div>

      {/* 按场景明细 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-sm font-bold text-gray-800">各场景用量明细</div>
          <div className="text-xs text-gray-400 mt-0.5">按场景分类统计，可对应管理平台的 AI 模型配置</div>
        </div>
        <div className="divide-y divide-gray-50">
          {data.by_scene.map((row, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm font-medium text-gray-800">{USE_CASE_LABELS[row.use_case] || row.use_case}</span>
                  <span className="ml-2 text-xs text-gray-400">{row.provider} · {row.model_name}</span>
                </div>
                <span className="text-xs font-bold text-blue-600">{row.call_count.toLocaleString()} 次</span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>输入 {row.total_input_tokens.toLocaleString()} tok</span>
                <span>输出 {row.total_output_tokens.toLocaleString()} tok</span>
                {row.total_audio_seconds > 0 && <span>语音 {row.total_audio_seconds >= 60 ? (row.total_audio_seconds/60).toFixed(1)+'分' : row.total_audio_seconds+'秒'}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5: 菜单配置
// ═══════════════════════════════════════════════════════════════════════════════

function MenuTab() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/wecom/menu')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.menu) {
          setMenu(d.menu);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="px-4 py-8 text-center text-xs text-gray-400">加载中...</div>;

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

// ─── 平台管理总控台（管理员视角，4个Tab）──────────────────────────────────────

// 总览Tab：所有分身数据面板
function PlatformOverviewTab({ channels }: { channels: Channel[] }) {
  const [twinStats, setTwinStats] = useState<Record<number, any>>({});
  const [kbStats, setKbStats] = useState<{ item_count: number; file_count: number; char_count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // 加载每个分身的语料统计
        const kfChannels = channels.filter(ch => ch.channel_type === 'kf' && ch.project_key !== '__platform__');
        const statsMap: Record<number, any> = {};
        await Promise.all(
          kfChannels.map(async (ch) => {
            try {
              const r = await fetch(`/api/wecom/corpus/stats?channel_id=${ch.id}`);
              const d = await r.json();
              if (d.ok) statsMap[ch.id] = d;
            } catch {}
          })
        );
        setTwinStats(statsMap);
        // 加载共享知识库统计
        const kbRes = await fetch('/api/wecom/ch/kb/stats?channel_id=2');
        const kbData = await kbRes.json();
        if (kbData.ok) setKbStats(kbData);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [channels]);

  const kfChannels = channels.filter(ch => ch.channel_type === 'kf' && ch.project_key !== '__platform__');
  const activeCount = kfChannels.filter(ch => ch.is_enabled).length;
  const twinOnCount = kfChannels.filter(ch => twinStats[ch.id]?.twin_enabled).length;
  const totalCorpus = kfChannels.reduce((sum, ch) => sum + (twinStats[ch.id]?.total || 0), 0);
  const totalQuality = kfChannels.reduce((sum, ch) => sum + (twinStats[ch.id]?.quality_count || 0), 0);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>;

  return (
    <div className="space-y-4">
      {/* 顶部总览卡片 */}
      <div className="bg-gradient-to-br from-[#0d2818] to-[#1a5c2e] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-xs text-green-300 font-medium tracking-wider">AI 数字银行 · 管理员总控台</span>
        </div>
        <div className="text-2xl font-bold mt-2">{kfChannels.length} 个数字分身</div>
        <div className="text-xs text-green-300 mt-1">{activeCount} 个运行中 · {twinOnCount} 个AI分身已激活</div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs text-green-300 mb-1">累计语料</div>
            <div className="text-xl font-bold">{totalCorpus}</div>
            <div className="text-xs text-green-400">条对话记录</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs text-green-300 mb-1">优质语料</div>
            <div className="text-xl font-bold text-[#f5c842]">{totalQuality}</div>
            <div className="text-xs text-green-400">条精选训练集</div>
          </div>
        </div>
      </div>

      {/* 共享知识库摘要 */}
      {kbStats && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">共享知识库</p>
              <p className="text-xs text-gray-400">所有分身共同继承</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{kbStats.item_count}</div>
              <div className="text-xs text-gray-400">知识条目</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{kbStats.file_count}</div>
              <div className="text-xs text-gray-400">文件数</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{(kbStats.char_count / 1000).toFixed(1)}k</div>
              <div className="text-xs text-gray-400">字符量</div>
            </div>
          </div>
        </div>
      )}

      {/* 各分身状态列表 */}
      <div>
        <p className="text-xs text-gray-400 mb-2 font-medium">分身运行状态</p>
        <div className="space-y-2">
          {kfChannels.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">暂无数字分身账户</div>
          )}
          {kfChannels.map(ch => {
            const ts = twinStats[ch.id];
            return (
              <div key={ch.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${ch.is_enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium text-gray-900">{ch.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ts?.twin_enabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">AI激活</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ch.is_enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>{ch.is_enabled ? '运行中' : '已停用'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{ts?.total || 0}</div>
                    <div className="text-xs text-gray-400">语料总量</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#f5c842]">{ts?.quality_count || 0}</div>
                    <div className="text-xs text-gray-400">优质语料</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{ch.kf_id ? ch.kf_id.slice(-6) : '-'}</div>
                    <div className="text-xs text-gray-400">客服ID尾号</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 分身账户Tab：账户列表+绑定状态+新增
function PlatformAccountsTab({ channels, onRefresh }: { channels: Channel[]; onRefresh: () => void }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addKfId, setAddKfId] = useState('');
  const [addAppId, setAddAppId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function handleSyncKfAccounts() {
    setSyncing(true);
    try {
      const res = await fetch('/api/wecom/channels/sync-kf-accounts', { method: 'POST' });
      const d = await res.json();
      if (d.ok) {
        toast.success(`同步完成：共 ${d.total} 个账号，新增 ${d.created?.length || 0} 个`);
        onRefresh();
      } else {
        toast.error(d.error || '同步失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSyncing(false); }
  }

  const kfChannels = channels.filter(ch => ch.channel_type === 'kf' && ch.project_key !== '__platform__');

  async function handleAddAccount() {
    if (!addName.trim() || !addKfId.trim()) { toast.error('请填写分身名称和客服ID'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/wecom/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), channel_type: 'kf', kf_id: addKfId.trim(), app_id: addAppId, is_enabled: 1 }),
      });
      const d = await res.json();
      if (d.ok || d.id) {
        toast.success('分身账户已开通');
        setShowAddModal(false);
        setAddName(''); setAddKfId('');
        onRefresh();
      } else {
        toast.error(d.error || '开通失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  }

  async function handleToggle(ch: Channel) {
    setToggling(ch.id);
    try {
      const res = await fetch(`/api/wecom/channels/${ch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: ch.is_enabled ? 0 : 1 }),
      });
      const d = await res.json();
      if (d.ok) { toast.success(ch.is_enabled ? '已停用' : '已启用'); onRefresh(); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setToggling(null); }
  }

  return (
    <div className="space-y-3">
      {/* 开通新分身按钮 */}
      {/* 操作按鈕行 */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-green-300 text-green-600 text-sm font-medium bg-green-50/50 active:bg-green-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          开通新分身
        </button>
        <button
          onClick={handleSyncKfAccounts}
          disabled={syncing}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium bg-blue-50 active:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          同步客服
        </button>
      </div>

      {/* 分身列表 */}
      {kfChannels.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">暂无分身账户，点击上方开通</div>
      )}
      {kfChannels.map(ch => (
        <div key={ch.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              ch.is_enabled ? 'bg-gradient-to-br from-[#1a5c2e] to-[#2d8a47]' : 'bg-gray-100'
            }`}>
              <Bot className={`w-5 h-5 ${ch.is_enabled ? 'text-[#4ade80]' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{ch.name}</p>
              <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{ch.kf_id || '未配置客服ID'}</p>
            </div>
            <button
              onClick={() => handleToggle(ch)}
              disabled={toggling === ch.id}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                ch.is_enabled
                  ? 'bg-red-50 text-red-500 active:bg-red-100'
                  : 'bg-green-50 text-green-600 active:bg-green-100'
              }`}
            >
              {toggling === ch.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                ch.is_enabled ? <StopCircle className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />
              )}
              {ch.is_enabled ? '停用' : '启用'}
            </button>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="text-gray-400">账户ID：</span>
              <span className="font-mono text-gray-700">#{ch.id}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="text-gray-400">创建：</span>
              <span className="text-gray-700">{ch.created_at ? ch.created_at.slice(0, 10) : '-'}</span>
            </div>
          </div>
        </div>
      ))}

      {/* 新增分身弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">开通新分身账户</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">分身名称 *</label>
                <input
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="例：营养顾问小李"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">企微客服账号ID *</label>
                <input
                  value={addKfId}
                  onChange={e => setAddKfId(e.target.value)}
                  placeholder="例：wkxxxxxxxxxxxxxxxx"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-green-400"
                />
                <p className="text-xs text-gray-400 mt-1">在企业微信后台「客服账号」中查看</p>
              </div>
            </div>
            <button
              onClick={handleAddAccount}
              disabled={saving}
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-[#1a5c2e] to-[#2d8a47] text-white text-sm font-semibold flex items-center justify-center gap-2 active:opacity-90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              确认开通
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 平台指令库Tab（管理 channel_id=1 的共享 prompt-rules）
function PlatformRulesTab() {
  interface PromptRule {
    id: number;
    channel_id: number;
    layer: number;
    category: string;
    content: string;
    enabled: number;
    sort_order: number;
    remark: string;
    created_at: string;
    updated_at: string;
  }
  const [rules, setRules] = useState<PromptRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRule, setAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editRuleDraft, setEditRuleDraft] = useState<Partial<PromptRule>>({});
  const [newRule, setNewRule] = useState({ layer: 1, category: '角色定义', content: '', remark: '' });
  const [savingRule, setSavingRule] = useState(false);
  const [ruleSearch, setRuleSearch] = useState('');
  const PLATFORM_CHANNEL_ID = 1;
  const PROMPT_CATEGORIES = ['角色定义', '知识库规则', '回复格式', '语气风格', '安全边界'];

  // AI辅助分析相关state
  const [rawInput, setRawInput] = useState(''); // 用户原始输入
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{
    suggested_layer: number;
    suggested_category: string;
    reason: string;
    polished: string;
  } | null>(null);

  async function handleAiAnalyze() {
    if (!rawInput.trim()) return;
    setAnalyzing(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/wecom/ai-analyze-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawInput }),
      });
      const d = await res.json();
      if (d.result) {
        setAiResult(d.result);
        setNewRule(r => ({
          ...r,
          layer: d.result.suggested_layer,
          category: d.result.suggested_category,
          content: d.result.polished,
        }));
      } else toast.error(d.error || 'AI分析失败');
    } catch { toast.error('网络错误'); }
    finally { setAnalyzing(false); }
  }

  function handleAcceptAi() {
    // 用户确认AI建议，直接保存
    handleAddRule();
  }

  function handleRejectAi() {
    // 用户拒绝，返回编辑原始输入
    setAiResult(null);
    setNewRule(r => ({ ...r, content: rawInput }));
  }

  async function loadRules() {
    setLoading(true);
    try {
      const res = await fetch(`/api/wecom/channels/${PLATFORM_CHANNEL_ID}/prompt-rules`);
      const d = await res.json();
      if (d.rules) setRules(d.rules);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadRules(); }, []);

  async function handleAddRule() {
    if (!newRule.content.trim()) return;
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${PLATFORM_CHANNEL_ID}/prompt-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      const d = await res.json();
      if (d.rule) {
        setRules(prev => [...prev, d.rule]);
        setNewRule({ layer: 1, category: '角色定义', content: '', remark: '' });
        setAddingRule(false);
        toast.success('指令已添加');
      } else toast.error(d.error || '添加失败');
    } catch { toast.error('网络错误'); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(rule: PromptRule) {
    const newEnabled = rule.enabled ? 0 : 1;
    try {
      const res = await fetch(`/api/wecom/channels/${PLATFORM_CHANNEL_ID}/prompt-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const d = await res.json();
      if (d.rule) setRules(prev => prev.map(r => r.id === rule.id ? d.rule : r));
    } catch { toast.error('网络错误'); }
  }

  async function handleSaveRule(ruleId: number) {
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${PLATFORM_CHANNEL_ID}/prompt-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRuleDraft),
      });
      const d = await res.json();
      if (d.rule) {
        setRules(prev => prev.map(r => r.id === ruleId ? d.rule : r));
        setEditingRuleId(null);
        setEditRuleDraft({});
        toast.success('已保存');
      } else toast.error(d.error || '保存失败');
    } catch { toast.error('网络错误'); }
    finally { setSavingRule(false); }
  }

  async function handleDeleteRule(ruleId: number) {
    if (!confirm('确认删除这条平台指令？')) return;
    try {
      await fetch(`/api/wecom/channels/${PLATFORM_CHANNEL_ID}/prompt-rules/${ruleId}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  }

  const layer1 = rules.filter(r => r.layer === 1 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.remark?.includes(ruleSearch)));
  const layer2 = rules.filter(r => r.layer === 2 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.category.includes(ruleSearch) || r.remark?.includes(ruleSearch)));

  return (
    <div className="space-y-4">
      {/* 顶部绿色卡片 */}
      <div className="bg-gradient-to-br from-[#0d2818] to-[#1a5c2e] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-xs text-green-300 font-medium tracking-wider">平台指令库 · 所有分身共同继承</span>
        </div>
        <div className="text-2xl font-bold mt-2">{rules.filter(r => r.enabled).length} 条生效指令</div>
        <div className="text-xs text-green-300 mt-1">共 {rules.length} 条 · 第1层角色定义 {rules.filter(r=>r.layer===1).length} 条 · 第2层行为规则 {rules.filter(r=>r.layer===2).length} 条</div>
      </div>

      {/* 搜索 + 新增 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={ruleSearch}
            onChange={e => setRuleSearch(e.target.value)}
            placeholder="搜索指令内容..."
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {ruleSearch && (
            <button onClick={() => setRuleSearch('')} className="absolute right-2 top-2 text-gray-400"><X className="w-4 h-4" /></button>
          )}
        </div>
        <button
          onClick={() => { setAddingRule(true); setNewRule({ layer: 1, category: '角色定义', content: '', remark: '' }); }}
          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gradient-to-r from-[#1a5c2e] to-[#2d8a47] text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" />新增
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>
      ) : (
        <>
          {/* 第一层：角色定义 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                  <span className="text-xs font-bold text-purple-600">①</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">角色定义</p>
                  <p className="text-xs text-gray-400">你是谁、你的边界</p>
                </div>
              </div>
              <span className="text-xs text-gray-400">{layer1.length} 条</span>
            </div>
            {layer1.length === 0 && (
              <div className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">暂无角色定义，点击「新增」添加</div>
            )}
            {layer1.map(rule => (
              <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                {editingRuleId === rule.id ? (
                  <div className="p-3 space-y-2">
                    <textarea value={editRuleDraft.content ?? rule.content} onChange={e => setEditRuleDraft(d => ({...d, content: e.target.value}))} rows={3} className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none" />
                    <input type="text" value={editRuleDraft.remark ?? rule.remark} onChange={e => setEditRuleDraft(d => ({...d, remark: e.target.value}))} placeholder="备注" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingRuleId(null); setEditRuleDraft({}); }} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                      <button onClick={() => handleSaveRule(rule.id)} disabled={savingRule} className="text-xs text-white bg-blue-500 px-3 py-1 rounded disabled:opacity-50">保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{rule.content}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleToggleRule(rule)}>
                          {rule.enabled ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                        <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 第二层：行为规则 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">②</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">行为规则</p>
                  <p className="text-xs text-gray-400">知识库/回复/语气/安全</p>
                </div>
              </div>
              <span className="text-xs text-gray-400">{layer2.length} 条</span>
            </div>
            {layer2.length === 0 && (
              <div className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">暂无行为规则</div>
            )}
            {layer2.map(rule => (
              <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? 'border-blue-200 bg-blue-50/20' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                {editingRuleId === rule.id ? (
                  <div className="p-3 space-y-2">
                    <select value={editRuleDraft.category ?? rule.category} onChange={e => setEditRuleDraft(d => ({...d, category: e.target.value}))} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none">
                      {PROMPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <textarea value={editRuleDraft.content ?? rule.content} onChange={e => setEditRuleDraft(d => ({...d, content: e.target.value}))} rows={3} className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none" />
                    <input type="text" value={editRuleDraft.remark ?? rule.remark} onChange={e => setEditRuleDraft(d => ({...d, remark: e.target.value}))} placeholder="备注" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingRuleId(null); setEditRuleDraft({}); }} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                      <button onClick={() => handleSaveRule(rule.id)} disabled={savingRule} className="text-xs text-white bg-blue-500 px-3 py-1 rounded disabled:opacity-50">保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded mr-1.5 ${
                          rule.category === '知识库规则' ? 'bg-green-100 text-green-700' :
                          rule.category === '回复格式' ? 'bg-orange-100 text-orange-700' :
                          rule.category === '语气风格' ? 'bg-pink-100 text-pink-700' :
                          rule.category === '安全边界' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{rule.category}</span>
                        <span className="text-sm text-gray-800 whitespace-pre-wrap">{rule.content}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleToggleRule(rule)}>
                          {rule.enabled ? <ToggleRight className="w-6 h-6 text-blue-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                        <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 新增指令弹层（AI辅助录入） */}
      {addingRule && (
        <div className="border border-green-200 rounded-xl overflow-hidden bg-white shadow-sm">
          {/* 弹层标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0d2818] to-[#1a5c2e]">
            <span className="text-sm font-semibold text-white">新增平台指令</span>
            <button onClick={() => { setAddingRule(false); setAiResult(null); setRawInput(''); }}>
              <X className="w-4 h-4 text-green-300" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* 第一步：原始输入区 */}
            {!aiResult && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">粘贴或输入指令内容</label>
                  <textarea
                    value={rawInput}
                    onChange={e => setRawInput(e.target.value)}
                    placeholder="直接输入或粘贴您的指令原文，AI 将帮您分析应放在角色定义还是行为规范，并对内容进行润色和补充..."
                    rows={8}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setAddingRule(false); setRawInput(''); }} className="text-xs text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-100">取消</button>
                  <button
                    onClick={handleAiAnalyze}
                    disabled={analyzing || !rawInput.trim()}
                    className="flex items-center gap-1.5 text-xs text-white bg-gradient-to-r from-[#1a5c2e] to-[#2d8a47] px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {analyzing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />AI 分析中...</>
                    ) : (
                      <>✨ AI 智能分析</>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* 第二步：AI分析结果 + 对比视图 */}
            {aiResult && (
              <>
                {/* AI建议分类 */}
                <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1a5c2e] to-[#2d8a47] flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-white font-bold">✨</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-800">
                      AI 建议放入：
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
                        aiResult.suggested_layer === 1 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {aiResult.suggested_layer === 1 ? '角色定义' : '行为规范'}
                      </span>
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">{aiResult.suggested_category}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{aiResult.reason}</p>
                  </div>
                </div>

                {/* 对比视图 */}
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-[11px] font-semibold text-gray-400">原文</span>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap border border-gray-100">{rawInput}</div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-1 text-[10px] text-green-600">
                      <span>↓</span>
                      <span>AI 已优化</span>
                      <span>↓</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-[11px] font-semibold text-green-700">优化后</span>
                    </div>
                    <textarea
                      value={newRule.content}
                      onChange={e => setNewRule(r => ({...r, content: e.target.value}))}
                      rows={4}
                      className="w-full text-xs text-gray-800 bg-green-50/50 rounded-lg px-3 py-2 leading-relaxed border border-green-200 resize-none focus:outline-none focus:ring-2 focus:ring-green-100"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">可直接编辑上方内容进行调整</p>
                  </div>
                </div>

                {/* 备注 */}
                <input
                  type="text"
                  value={newRule.remark}
                  onChange={e => setNewRule(r => ({...r, remark: e.target.value}))}
                  placeholder={`备注（可不填）`}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
                />

                {/* 确认按鈕区 */}
                <div className="flex gap-2">
                  <button
                    onClick={handleRejectAi}
                    className="flex-1 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    返回修改
                  </button>
                  <button
                    onClick={handleAcceptAi}
                    disabled={savingRule || !newRule.content.trim()}
                    className="flex-1 py-2 text-xs text-white bg-gradient-to-r from-[#1a5c2e] to-[#2d8a47] rounded-lg disabled:opacity-50 font-medium"
                  >
                    {savingRule ? '保存中...' : '确认保存'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI 模型配置 Tab ──────────────────────────────────────────────────────────
interface AIModelOption {
  value: string;       // model_name
  label: string;       // 显示名称
  provider: string;    // 服务商
  price_note: string;  // 价格说明
  supports_vision?: boolean;
  supports_embedding?: boolean;
}
interface AIModelConfig {
  use_case: string;
  use_case_label: string;
  use_case_desc: string;
  provider: string;
  model_name: string;
  api_key: string;
  api_base: string;
  category: string;   // 'chat' | 'vision' | 'embedding'
}

function AIModelConfigTab() {
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [modelOptions, setModelOptions] = useState<Record<string, AIModelOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  // 本地编辑状态
  const [edits, setEdits] = useState<Record<string, Partial<AIModelConfig>>>({});
  // API Key 显示/隐藏
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  async function loadConfigs() {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/ai-model-configs');
      const d = await res.json();
      if (d.ok) {
        setConfigs(d.configs || []);
        setModelOptions(d.model_options || {});
        // 初始化编辑状态
        const initEdits: Record<string, Partial<AIModelConfig>> = {};
        for (const c of (d.configs || [])) {
          initEdits[c.use_case] = { provider: c.provider, model_name: c.model_name, api_key: c.api_key, api_base: c.api_base };
        }
        setEdits(initEdits);
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadConfigs(); }, []);

  async function saveConfig(useCase: string) {
    const e = edits[useCase];
    if (!e?.model_name) return;
    setSaving(useCase);
    try {
      const res = await fetch(`/api/wecom/ai-model-configs/${useCase}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(e),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success('已保存');
        loadConfigs();
      } else {
        toast.error(d.error || '保存失败');
      }
    } catch { toast.error('保存失败'); }
    finally { setSaving(null); }
  }

  function updateEdit(useCase: string, field: string, value: string) {
    setEdits(prev => ({
      ...prev,
      [useCase]: { ...prev[useCase], [field]: value }
    }));
    // 当选择模型时，自动填入对应的 provider
    if (field === 'model_name') {
      const cfg = configs.find(c => c.use_case === useCase);
      const category = cfg?.category || 'chat';
      const options = modelOptions[category] || [];
      const opt = options.find(o => o.value === value);
      if (opt) {
        setEdits(prev => ({
          ...prev,
          [useCase]: { ...prev[useCase], model_name: value, provider: opt.provider }
        }));
      }
    }
  }

  const categoryLabel: Record<string, string> = {
    chat: '💬 对话模型',
    vision: '📷 视觉模型（图片识别）',
    embedding: '🔍 向量模型（语义检索）',
  };

  const groupedConfigs = configs.reduce((acc, c) => {
    const cat = c.category || 'chat';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {} as Record<string, AIModelConfig[]>);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>;

  return (
    <div className="space-y-5">
      {/* 说明卡片 */}
      <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-2xl p-4 text-white">
        <div className="text-xs text-green-300 font-medium tracking-wider mb-1">平台管理 · 全局生效</div>
        <div className="text-xl font-bold">AI 模型配置</div>
        <div className="text-xs text-green-200 mt-1">在此配置各功能使用的 AI 模型，保存后全平台所有分身立即生效。</div>
      </div>

      {/* 按分类展示 */}
      {Object.entries(groupedConfigs).map(([category, catConfigs]) => (
        <div key={category}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {categoryLabel[category] || category}
          </div>
          <div className="space-y-3">
            {catConfigs.map(cfg => {
              const e = edits[cfg.use_case] || {};
              const options = modelOptions[cfg.category] || [];
              const selectedOpt = options.find(o => o.value === (e.model_name || cfg.model_name));
              const isSaving = saving === cfg.use_case;
              return (
                <div key={cfg.use_case} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  {/* 场景标题 */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-gray-800">{cfg.use_case_label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{cfg.use_case_desc}</div>
                    </div>
                    {selectedOpt && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        selectedOpt.price_note.includes('免费') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {selectedOpt.price_note.includes('免费') ? '免费' : '付费'}
                      </span>
                    )}
                  </div>

                  {/* 模型选择下拉框 */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-500 mb-1 block">选择模型</label>
                    <select
                      value={e.model_name || cfg.model_name}
                      onChange={ev => updateEdit(cfg.use_case, 'model_name', ev.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                      {options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}  ·  {opt.price_note}
                        </option>
                      ))}
                    </select>
                    {selectedOpt && (
                      <div className="text-[11px] text-gray-400 mt-1 px-1">
                        服务商：{selectedOpt.provider} &nbsp;·&nbsp; {selectedOpt.price_note}
                      </div>
                    )}
                  </div>

                  {/* API Key 输入框（embedding 场景不需要单独输入，复用混元Key） */}
                  {cfg.category !== 'embedding' && (
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                      <div className="relative">
                        <input
                          type={showKey[cfg.use_case] ? 'text' : 'password'}
                          value={e.api_key ?? cfg.api_key}
                          onChange={ev => updateEdit(cfg.use_case, 'api_key', ev.target.value)}
                          placeholder="输入 API Key（留空则使用平台默认）"
                          className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-400 pr-10 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(prev => ({ ...prev, [cfg.use_case]: !prev[cfg.use_case] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
                        >
                          {showKey[cfg.use_case] ? '隐藏' : '显示'}
                        </button>
                      </div>
                    </div>
                  )}
                  {cfg.category === 'embedding' && (
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                      向量模型 API Key 与「图片识别」共用混元 Key，无需单独配置。
                    </div>
                  )}

                  {/* 保存按钮 */}
                  <button
                    onClick={() => saveConfig(cfg.use_case)}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// 平台共享 Tab：上方平台共享指令库 + 下方平台共享知识库
interface SharedKb { id: number; name: string; description?: string | null; item_count: number; }

// 平台版「零步 AI 辅助整理」：把大白话智能归类后写入平台共享规则(channel_id=1)与选中的共享库
interface PlatAddPrompt { content: string; original?: string; action?: 'add' | 'merge' | 'skip'; recommendation?: 'add' | 'skip'; dedup_reason?: string; matched?: string; }
interface PlatAddKb { question: string; answer: string; originalQuestion?: string; originalAnswer?: string; action?: 'add' | 'merge' | 'skip'; recommendation?: 'add' | 'skip'; dedup_reason?: string; matched?: string; }
interface PlatAiResult { ok: boolean; prompt_additions: PlatAddPrompt[]; kb_items: PlatAddKb[]; summary?: string; dup_summary?: string; }

function PlatformAiAssistCard({ sharedKbs, onApplied }: { sharedKbs: SharedKb[]; onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // 选中的目标库 id 集合；空集且 allKb=true 表示全部库
  const [allKb, setAllKb] = useState(true);
  const [selKbIds, setSelKbIds] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<PlatAiResult | null>(null);
  const [selPrompts, setSelPrompts] = useState<boolean[]>([]);
  const [selKbs, setSelKbs] = useState<boolean[]>([]);

  // 实际用于查重/写入的目标库 id 列表
  const targetKbIds = allKb ? sharedKbs.map(k => k.id) : selKbIds;

  function toggleKb(id: number) {
    setSelKbIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleAnalyze() {
    if (!input.trim()) { toast.error("请先输入内容"); return; }
    setAnalyzing(true); setResult(null); setDone(false);
    try {
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, scope: "platform", kbIds: targetKbIds }),
      });
      const d = await res.json();
      if (d.ok) {
        setResult(d);
        setSelPrompts((d.prompt_additions || []).map((p: PlatAddPrompt) => p.recommendation !== 'skip'));
        setSelKbs((d.kb_items || []).map((k: PlatAddKb) => k.recommendation !== 'skip'));
      } else {
        toast.error(d.error || "AI 分析失败");
      }
    } catch { toast.error("网络错误"); } finally { setAnalyzing(false); }
  }

  async function handleApply() {
    if (!result) return;
    const chosenPrompts = result.prompt_additions.filter((_, i) => selPrompts[i]);
    const chosenKbs = result.kb_items.filter((_, i) => selKbs[i]);
    if (chosenPrompts.length === 0 && chosenKbs.length === 0) { toast.error("请至少勾选一条"); return; }
    if (chosenKbs.length > 0 && targetKbIds.length === 0) { toast.error("请先选择要写入的共享库"); return; }
    setApplying(true);
    try {
      let ruleOk = 0, kbOk = 0;
      // 写入平台共享规则 channel_id=1
      for (const p of chosenPrompts) {
        try {
          const r = await fetch(`/api/wecom/channels/1/prompt-rules`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layer: 2, category: "行为规则", content: p.content }),
          });
          if ((await r.json()).rule) ruleOk++;
        } catch {}
      }
      // 写入知识库：写入每个选中的共享库
      for (const item of chosenKbs) {
        for (const kbId of targetKbIds) {
          try {
            const r = await fetch(`/api/wecom/knowledge-bases/${kbId}/items`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_type: "qa", question: item.question, answer: item.answer }),
            });
            if ((await r.json()).ok) kbOk++;
          } catch {}
        }
      }
      const msgs: string[] = [];
      if (chosenPrompts.length > 0) msgs.push(`${ruleOk}/${chosenPrompts.length} 条规则已写入平台指令库`);
      if (chosenKbs.length > 0) msgs.push(`${chosenKbs.length} 条已写入 ${targetKbIds.length} 个共享库`);
      toast.success(msgs.join("；") || "已应用");
      setDone(true);
      setTimeout(() => { setResult(null); setInput(""); setDone(false); onApplied(); }, 1500);
    } catch { toast.error("写入失败"); } finally { setApplying(false); }
  }

  const addCount = result ? result.prompt_additions.filter((_, i) => selPrompts[i]).length + result.kb_items.filter((_, i) => selKbs[i]).length : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">AI 辅助整理（平台共享）</p>
            <p className="text-xs text-gray-400">粘大白话，自动归类写入平台指令库与共享库</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {/* 目标库选择 */}
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1.5">写入哪些共享库？</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setAllKb(true); setSelKbIds([]); }}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${allKb ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}
              >全部共享库（{sharedKbs.length}）</button>
              {sharedKbs.map(kb => {
                const active = !allKb && selKbIds.includes(kb.id);
                return (
                  <button
                    key={kb.id}
                    onClick={() => { setAllKb(false); toggleKb(kb.id); }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}
                  >{kb.name}</button>
                );
              })}
            </div>
            {!allKb && selKbIds.length === 0 && (
              <div className="text-[11px] text-amber-500 mt-1">未选库：只会写入“规则”，知识库条目需选中至少一个库</div>
            )}
          </div>
          <textarea
            value={input} onChange={e => setInput(e.target.value)} rows={4}
            placeholder="粘贴聊天记录、产品资料或话术，AI 会自动提炼并与现有平台内容查重后归类"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-green-400"
          />
          <button
            onClick={handleAnalyze} disabled={analyzing}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 分析中...</> : <><Sparkles className="w-4 h-4" /> AI 智能整理</>}
          </button>

          {result && (
            <div className="space-y-3">
              {(result.summary || result.dup_summary) && (
                <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 space-y-1">
                  {result.summary && <div className="flex items-start gap-1.5"><Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{result.summary}</span></div>}
                  {result.dup_summary && <div className="font-medium text-gray-700">{result.dup_summary}</div>}
                  <div className="text-gray-400">已自动归类：✅ 建议加入已默认勾选，⛔ 已去重默认不勾（可手动调整）</div>
                </div>
              )}
              {result.prompt_additions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500" />写入「平台指令库」</div>
                  {result.prompt_additions.map((p, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${selPrompts[i] ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                      <button onClick={() => setSelPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selPrompts[i] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>{selPrompts[i] && <Check className="w-3 h-3 text-white" />}</div>
                      </button>
                      <div className="flex-1 min-w-0">
                        {p.action === 'merge' && p.original ? (
                          <>
                            <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                            <span className="block text-xs text-gray-400 line-through whitespace-pre-wrap">{p.original}</span>
                            <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                            <span className={`block text-xs whitespace-pre-wrap ${selPrompts[i] ? 'text-purple-800 font-medium' : 'text-gray-400 line-through'}`}>{p.content}</span>
                          </>
                        ) : (
                          <span className={`block text-xs whitespace-pre-wrap ${selPrompts[i] ? 'text-purple-800' : 'text-gray-400 line-through'}`}>{p.content}</span>
                        )}
                        {p.dedup_reason && <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${p.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : p.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{p.recommendation === 'skip' ? '⛔ ' : p.action === 'merge' ? '✂️ ' : '✅ '}{p.dedup_reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {result.kb_items.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" />写入「共享知识库」{targetKbIds.length > 0 ? `（${targetKbIds.length} 个库）` : <span className="text-amber-500 font-normal ml-1">（未选库）</span>}</div>
                  {result.kb_items.map((item, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${selKbs[i] ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                      <button onClick={() => setSelKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selKbs[i] ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>{selKbs[i] && <Check className="w-3 h-3 text-white" />}</div>
                      </button>
                      <div className="flex-1 text-xs min-w-0">
                        {item.action === 'merge' && (item.originalAnswer || item.originalQuestion) ? (
                          <>
                            <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                            <div className="text-gray-400 line-through">Q: {item.originalQuestion}</div>
                            <div className="text-gray-400 line-through mt-0.5">A: {item.originalAnswer}</div>
                            <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                            <div className={`font-medium ${selKbs[i] ? 'text-amber-800' : 'text-gray-400 line-through'}`}>Q: {item.question}</div>
                            <div className={`mt-0.5 ${selKbs[i] ? 'text-amber-700' : 'text-gray-400 line-through'}`}>A: {item.answer}</div>
                          </>
                        ) : (
                          <>
                            <div className={`font-medium ${selKbs[i] ? 'text-amber-800' : 'text-gray-400 line-through'}`}>Q: {item.question}</div>
                            <div className={`mt-0.5 ${selKbs[i] ? 'text-amber-700' : 'text-gray-400 line-through'}`}>A: {item.answer}</div>
                          </>
                        )}
                        {item.dedup_reason && <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${item.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : item.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{item.recommendation === 'skip' ? '⛔ ' : item.action === 'merge' ? '✂️ ' : '✅ '}{item.dedup_reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(result.prompt_additions.length > 0 || result.kb_items.length > 0) && (
                <button onClick={handleApply} disabled={applying || done}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50">
                  {done ? <><Check className="w-4 h-4" /> 已应用</> : applying ? <><Loader2 className="w-4 h-4 animate-spin" /> 写入中...</> : `应用已勾选的 ${addCount} 条`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlatformSharedTab() {
  // 指令区块展开/折叠
  const [rulesOpen, setRulesOpen] = useState(true);
  // 知识库区块展开/折叠
  const [kbOpen, setKbOpen] = useState(true);
  // 公共库列表
  const [sharedKbs, setSharedKbs] = useState<SharedKb[]>([]);
  const [kbLoading, setKbLoading] = useState(true);
  // 当前进入管理的库（null = 列表视图）
  const [activeKb, setActiveKb] = useState<SharedKb | null>(null);
  // 新建/重命名弹窗
  const [showKbModal, setShowKbModal] = useState(false);
  const [editingKb, setEditingKb] = useState<SharedKb | null>(null);
  const [kbNameDraft, setKbNameDraft] = useState("");
  const [kbDescDraft, setKbDescDraft] = useState("");
  const [savingKb, setSavingKb] = useState(false);
  const [deletingKb, setDeletingKb] = useState<SharedKb | null>(null);

  async function loadSharedKbs() {
    setKbLoading(true);
    try {
      const r = await fetch('/api/wecom/shared-kbs');
      const d = await r.json();
      if (Array.isArray(d)) setSharedKbs(d.map((k: any) => ({ ...k, item_count: Number(k.item_count || 0) })));
    } catch {} finally { setKbLoading(false); }
  }

  useEffect(() => { loadSharedKbs(); }, []);

  const totalItems = sharedKbs.reduce((s, k) => s + (k.item_count || 0), 0);

  function openCreate() {
    setEditingKb(null); setKbNameDraft(""); setKbDescDraft(""); setShowKbModal(true);
  }
  function openRename(kb: SharedKb) {
    setEditingKb(kb); setKbNameDraft(kb.name); setKbDescDraft(kb.description || ""); setShowKbModal(true);
  }
  async function handleSaveKb() {
    if (!kbNameDraft.trim()) { toast.error("请输入库名"); return; }
    setSavingKb(true);
    try {
      if (editingKb) {
        const r = await fetch(`/api/wecom/shared-kbs/${editingKb.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: kbNameDraft.trim(), description: kbDescDraft.trim() || null }),
        });
        if ((await r.json()).ok) { toast.success("已保存"); setShowKbModal(false); loadSharedKbs(); }
        else toast.error("保存失败");
      } else {
        const r = await fetch('/api/wecom/shared-kbs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: kbNameDraft.trim(), description: kbDescDraft.trim() || null }),
        });
        if ((await r.json()).ok) { toast.success("已创建"); setShowKbModal(false); loadSharedKbs(); }
        else toast.error("创建失败");
      }
    } catch { toast.error("网络错误"); } finally { setSavingKb(false); }
  }
  async function handleDeleteKb() {
    if (!deletingKb) return;
    try {
      const r = await fetch(`/api/wecom/shared-kbs/${deletingKb.id}`, { method: 'DELETE' });
      if ((await r.json()).ok) { toast.success("已删除"); setDeletingKb(null); loadSharedKbs(); }
      else toast.error("删除失败");
    } catch { toast.error("删除失败"); }
  }

  return (
    <div className="space-y-4">
      {/* 顶部绿色总览卡片 */}
      <div className="bg-gradient-to-br from-[#0d2818] to-[#1a5c2e] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-xs text-green-300 font-medium tracking-wider">平台共享 · 所有分身共同继承</span>
        </div>
        <div className="text-2xl font-bold mt-2">平台共享资源</div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs text-green-300 mb-1">平台指令库</div>
            <div className="text-xs text-green-400">角色定义 + 行为规则</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs text-green-300 mb-1">共享知识库</div>
            <div className="text-xl font-bold text-[#f5c842]">{kbLoading ? '-' : `${sharedKbs.length} 个`}</div>
            <div className="text-xs text-green-400">共 {totalItems} 条内容</div>
          </div>
        </div>
      </div>

      {/* 零步 AI 辅助整理（平台共享） */}
      <PlatformAiAssistCard sharedKbs={sharedKbs} onApplied={loadSharedKbs} />

      {/* 区块1：平台指令库 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setRulesOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">平台指令库</p>
              <p className="text-xs text-gray-400">角色定义与行为规则，所有分身共享</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} />
        </button>
        {rulesOpen && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <PlatformRulesTab />
          </div>
        )}
      </div>

      {/* 区块2：平台公共知识库（多库） */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setKbOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Library className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">平台公共知识库</p>
              <p className="text-xs text-gray-400">可建多个主题库，分身按需调用</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!kbLoading && (
              <span className="text-xs text-gray-400">{sharedKbs.length} 个库</span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${kbOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {kbOpen && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            {activeKb ? (
              /* 进入单库管理视图 */
              <div>
                <button
                  onClick={() => { setActiveKb(null); loadSharedKbs(); }}
                  className="flex items-center gap-1.5 text-sm text-green-600 mb-3"
                >
                  <ArrowLeft className="w-4 h-4" /> 返回公共库列表
                </button>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Library className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-gray-900">{activeKb.name}</span>
                  <span className="text-xs text-gray-400">公共库</span>
                </div>
                <ChannelKnowledgeTab channelType="kf" kbId={activeKb.id} />
              </div>
            ) : (
              /* 公共库列表视图 */
              <div className="space-y-2">
                {kbLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>
                ) : (
                  <>
                    {sharedKbs.length === 0 && (
                      <div className="text-center py-6 text-gray-400 text-sm">暂无公共库，点击下方「新建公共库」创建</div>
                    )}
                    {sharedKbs.map(kb => (
                      <div key={kb.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                        <button className="flex items-center gap-2.5 flex-1 min-w-0 text-left" onClick={() => setActiveKb(kb)}>
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                            <Library className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{kb.name}</p>
                            <p className="text-xs text-gray-400">{kb.item_count} 条内容{kb.description ? ` · ${kb.description}` : ''}</p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openRename(kb)} className="p-1.5 text-gray-400 hover:text-gray-600" title="重命名">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeletingKb(kb)} className="p-1.5 text-gray-400 hover:text-red-500" title="删除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setActiveKb(kb)} className="p-1.5 text-green-500" title="管理">
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={openCreate}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-green-300 text-green-600 text-sm font-medium hover:bg-green-50"
                    >
                      <FolderPlus className="w-4 h-4" /> 新建公共库
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 新建/重命名公共库弹窗 */}
      {showKbModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setShowKbModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 mb-3">{editingKb ? '重命名公共库' : '新建公共库'}</p>
            <label className="text-xs text-gray-500">库名</label>
            <input
              value={kbNameDraft} onChange={e => setKbNameDraft(e.target.value)}
              placeholder="如：健康减肥、营养基础"
              className="w-full mt-1 mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-400"
            />
            <label className="text-xs text-gray-500">描述（可选）</label>
            <input
              value={kbDescDraft} onChange={e => setKbDescDraft(e.target.value)}
              placeholder="一句话描述这个库的用途"
              className="w-full mt-1 mb-4 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-400"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowKbModal(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">取消</button>
              <button onClick={handleSaveKb} disabled={savingKb} className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-medium disabled:opacity-50">
                {savingKb ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingKb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setDeletingKb(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 mb-2">删除公共库？</p>
            <p className="text-sm text-gray-500 mb-4">将删除「{deletingKb.name}」及其内 {deletingKb.item_count} 条内容，并解除所有分身对它的绑定。此操作不可恢复。</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingKb(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">取消</button>
              <button onClick={handleDeleteKb} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 平台用量统计Tab（绿色总览风格）
function PlatformUsageTabView() {
  return (
    <div className="space-y-4">
      {/* 顶部绿色卡片 */}
      <div className="bg-gradient-to-br from-[#0d2818] to-[#1a5c2e] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-xs text-green-300 font-medium tracking-wider">用量统计 · 全平台 AI 费用概览</span>
        </div>
        <div className="text-2xl font-bold mt-2">费用明细</div>
        <div className="text-xs text-green-300 mt-1">按用户 / 按时间 / 按模型 多维分析</div>
      </div>
      {/* 统计内容 */}
      <StatsTab />
    </div>
  );
}

// 主PlatformKbView组件
function PlatformKbView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'shared' | 'usage'>('overview');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadChannels() {
    setLoading(true);
    try {
      const res = await fetch('/api/wecom/channels?app_id=1');
      const d = await res.json();
      setChannels(d.channels || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadChannels(); }, []);

  const tabs = [
    { key: 'overview', label: '总览', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { key: 'accounts', label: '分身账户', icon: <Bot className="w-3.5 h-3.5" /> },
    { key: 'shared', label: '平台共享', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'ai_model', label: 'AI模型', icon: <Zap className="w-3.5 h-3.5" /> },
    { key: 'usage', label: '用量统计', icon: <Coins className="w-3.5 h-3.5" /> },
  ];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-green-500" /></div>;

  return (
    <div>
      {/* Tab切换 */}
      <div className="flex gap-0.5 mb-4 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap px-1 ${
              activeTab === t.key
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <PlatformOverviewTab channels={channels} />}
      {activeTab === 'accounts' && <PlatformAccountsTab channels={channels} onRefresh={loadChannels} />}
      {activeTab === 'shared' && <PlatformSharedTab />}
      {activeTab === 'ai_model' && <AIModelConfigTab />}
      {activeTab === 'usage' && <PlatformUsageTabView />}
    </div>
  );
}

function ChannelTab() {
  const [apps, setApps] = useState<WecomApp[]>([]);
  const [loading, setLoading] = useState(true);
  // 三级导航： null=应用列表, WecomApp=渠道列表, Channel=渠道详情
  const [selectedApp, setSelectedApp] = useState<WecomApp | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  // 平台管理视图（系统默认知识库）
  const [showPlatform, setShowPlatform] = useState(false);

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

  // 平台管理视图
  if (showPlatform) {
    return (
      <div>
        {/* 帽子 */}
        <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg,#0d2818 0%,#1a5c2e 100%)' }}>
          <div className="flex items-center gap-3 px-4" style={{ height: 48 }}>
            <button onClick={() => setShowPlatform(false)} className="p-1.5 rounded-full" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <div className="text-sm font-bold text-white leading-tight">平台管理</div>
              <div className="text-[10px] text-green-300">渠道 » 平台管理</div>
            </div>
          </div>
        </div>
        <div className="px-4 py-4">
          <PlatformKbView />
        </div>
      </div>
    );
  }

  // 第三级：渠道详情
  if (selectedChannel) {
    if (selectedChannel.id === 3) {
      return <NutritionClubPage onBack={() => setSelectedChannel(null)} />;
    }
    return (
      <div>
        {/* 帽子 */}
        <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg,#0d2818 0%,#1a5c2e 100%)' }}>
          <div className="flex items-center gap-3 px-4" style={{ height: 48 }}>
            <button onClick={() => setSelectedChannel(null)} className="p-1.5 rounded-full" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <div className="text-sm font-bold text-white leading-tight">{selectedChannel.name}</div>
              <div className="text-[10px] text-green-300">渠道 » {selectedApp?.name} » {selectedChannel.channel_type === 'app' ? '客户联系' : '微信客服'}</div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              selectedChannel.is_enabled ? 'bg-green-400/20 text-green-200' : 'bg-gray-400/20 text-gray-300'
            }`}>{selectedChannel.is_enabled ? '运行中' : '已停用'}</span>
          </div>
        </div>
        <div className="px-4 py-4">
          <ChannelDetail channel={selectedChannel} />
        </div>
      </div>
    );
  }

  // 第二级：渠道列表
  if (selectedApp) {
    return <AppChannelList app={selectedApp} onSelectChannel={setSelectedChannel} onBack={() => setSelectedApp(null)} onShowPlatform={() => setShowPlatform(true)} />;
  }

  // 第一级：应用列表
  return (
    <div>
      {/* 帽子 */}
      <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg,#0d2818 0%,#1a5c2e 100%)' }}>
        <div className="flex items-center justify-between px-4" style={{ height: 48 }}>
          <div className="text-sm font-bold text-white">渠道</div>
          <button onClick={() => window.location.reload()} className="text-[11px] text-green-300 border border-green-600/40 rounded-full px-3 py-1 active:opacity-70">
            刷新
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-green-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => (
              <button
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a5c2e] to-[#2d8a47] flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-[#4ade80]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{app.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">CorpID: {app.corp_id}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    app.is_enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}>{app.is_enabled ? '启用' : '停用'}</span>
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
    </div>
  );
}

// 第二级：应用下的渠道列表
function AppChannelList({
  app,
  onSelectChannel,
  onBack,
  onShowPlatform,
}: {
  app: WecomApp;
  onSelectChannel: (ch: Channel) => void;
  onBack: () => void;
  onShowPlatform?: () => void;
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
    <div>
      {/* 帽子 */}
      <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg,#0d2818 0%,#1a5c2e 100%)' }}>
        <div className="flex items-center gap-3 px-4" style={{ height: 48 }}>
          <button onClick={onBack} className="p-1.5 rounded-full" style={{ color: 'rgba(255,255,255,0.8)' }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-tight">{app.name}</div>
            <div className="text-[10px] text-green-300">渠道 » {app.name}</div>
          </div>
          <button onClick={() => window.location.reload()} className="text-[11px] text-green-300 border border-green-600/40 rounded-full px-3 py-1 active:opacity-70">
            刷新
          </button>
        </div>
      </div>

      <div className="px-4 py-4">

      {/* 渠道列表 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-green-500" />
        </div>
      ) : (() => {
        const appChannels = channels.filter(ch => ch.channel_type === "app");
        const kfChannels = channels.filter(ch => ch.channel_type === "kf" && ch.project_key !== "__platform__");
        return (
          <div className="space-y-5">
            {/* 客户联系分组 */}
            {appChannels.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-3.5 rounded-full bg-blue-400" />
                  <p className="text-xs font-semibold text-gray-500">客户联系</p>
                  <span className="text-xs text-gray-400">{appChannels.length} 个</span>
                </div>
                <div className="space-y-2">
                  {appChannels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => onSelectChannel(ch)}
                      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4.5 h-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{ch.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">客户联系渠道</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          ch.is_enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}>{ch.is_enabled ? '启用' : '停用'}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 微信客服分组 */}
            {kfChannels.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-3.5 rounded-full bg-[#2d8a47]" />
                  <p className="text-xs font-semibold text-gray-500">微信客服</p>
                  <span className="text-xs text-gray-400">{kfChannels.length} 个账号</span>
                </div>
                <div className="space-y-2">
                  {kfChannels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => onSelectChannel(ch)}
                      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a5c2e] to-[#2d8a47] flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-[#4ade80]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{ch.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{ch.kf_id || '微信客服'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          ch.is_enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}>{ch.is_enabled ? '运行中' : '已停用'}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 平台管理入口 */}
            {onShowPlatform && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-3.5 rounded-full bg-amber-400" />
                  <p className="text-xs font-semibold text-gray-500">平台管理</p>
                </div>
                <button
                  onClick={onShowPlatform}
                  className="w-full text-left bg-gradient-to-r from-[#0d2818] to-[#1a5c2e] rounded-xl shadow-sm px-4 py-3.5 flex items-center gap-3 active:opacity-90 transition-opacity"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-[#4ade80]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">平台管理</p>
                    <p className="text-xs text-green-300 mt-0.5">共享指令库 · 共享知识库 · 分身账户</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
                </button>
              </div>
            )}

            {channels.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">该应用下暂无渠道</div>
            )}
          </div>
        );
      })()}
      </div>
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

      {activeTab === "config" && <ChannelConfigTab channel={channel} onJumpToKb={() => setActiveTab("kb")} />}
      {activeTab === "rules" && <ChannelCustomRulesTab channelType={channel.channel_type} />}
      {activeTab === "kb" && <ChannelKnowledgeTab channelType={channel.channel_type} channelId={channel.id} />}
      {activeTab === "users" && <ChannelUsersTab channelType={channel.channel_type} />}
      {activeTab === "logs" && <ChannelLogsTab channelType={channel.channel_type} channelId={channel.id} />}
    </div>
  );
}

// ─── AI辅助指令知识库维护卡片 ──────────────────────────────────────────────────

interface AiAssistResult {
  prompt_additions: PromptAddition[];
  kb_items: KbItemResult[];
  summary: string;
  dup_summary?: string;
  model_used?: string;
  tokens?: number;
}
type PromptAddition = {
  content: string;
  original?: string;
  action?: 'add' | 'merge' | 'skip';
  recommendation?: 'add' | 'skip';
  dedup_reason?: string;
  matched?: string;
};
type KbItemResult = {
  question: string;
  answer: string;
  originalQuestion?: string;
  originalAnswer?: string;
  action?: 'add' | 'merge' | 'skip';
  recommendation?: 'add' | 'skip';
  dedup_reason?: string;
  matched?: string;
};

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
  const [extracting, setExtracting] = useState(false); // 图片识别中
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [selectedPrompts, setSelectedPrompts] = useState<boolean[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<boolean[]>([]);
  // 结果条目可编辑状态
  const [editingPromptIdx, setEditingPromptIdx] = useState<number | null>(null);
  const [editingKbIdx, setEditingKbIdx] = useState<number | null>(null);
  const [editDraftPrompt, setEditDraftPrompt] = useState("");
  const [editDraftQ, setEditDraftQ] = useState("");
  const [editDraftA, setEditDraftA] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 图片上传识别
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      // 转 base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/wecom/ai-image-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const d = await res.json();
      if (d.ok && d.text) {
        setInputText(prev => prev ? prev + "\n\n" + d.text : d.text);
        toast.success("图片内容已识别并填入");
      } else {
        toast.error(d.error || "图片识别失败");
      }
    } catch {
      toast.error("图片识别失败");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAnalyze() {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    setResult(null);
    setApplyDone(false);
    setEditingPromptIdx(null);
    setEditingKbIdx(null);
    try {
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, channelId, kbId }),
      });
      const d = await res.json();
      if (d.ok) {
        setResult(d);
        // 默认只勾选 recommendation==='add' 的条目（已去重的不勾）
        setSelectedPrompts((d.prompt_additions || []).map((p: PromptAddition) => p.recommendation !== 'skip'));
        setSelectedKbs((d.kb_items || []).map((k: KbItemResult) => k.recommendation !== 'skip'));
      } else {
        toast.error(d.error || "AI分析失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setAnalyzing(false);
    }
  }

  // 保存指令编辑
  function savePromptEdit(i: number) {
    if (!result) return;
    const updated = [...result.prompt_additions];
    updated[i] = { ...updated[i], content: editDraftPrompt };
    setResult({ ...result, prompt_additions: updated });
    setEditingPromptIdx(null);
  }

  // 保存知识库条目编辑
  function saveKbEdit(i: number) {
    if (!result) return;
    const updated = [...result.kb_items];
    updated[i] = { ...updated[i], question: editDraftQ, answer: editDraftA };
    setResult({ ...result, kb_items: updated });
    setEditingKbIdx(null);
  }

  async function handleApply() {
    if (!result) return;
    setApplying(true);
    try {
      const chosenPrompts = result.prompt_additions.filter((_, i) => selectedPrompts[i]);
      for (const p of chosenPrompts) {
        onApplyPrompt(p.content);
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
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageUpload}
      />
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

          {/* 输入区 + 拍照按钮 */}
          <div className="relative">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="例如：客服要有耳心，不要用太官方的语气。我们的产品康宝莱F1单一99元，包含蛋白粉和维生素套餐。如果客户问价格，告诉他们具体套餐内容..."
              rows={5}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pb-10 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 text-gray-800 placeholder-gray-400"
            />
            {/* 拍照/上传图片按钮，浮在输入框右下角 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-purple-500 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-md transition-all disabled:opacity-50"
            >
              {extracting ? <><Loader2 className="w-3 h-3 animate-spin" />识别中...</> : <><Camera className="w-3 h-3" />拍照/上传</>}
            </button>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing || !inputText.trim()}
            className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />AI 分析中...</> : <><Sparkles className="w-4 h-4" />AI 分析并建议</>}
          </button>

          {result && (
            <div className="space-y-3">
              {(result.summary || result.model_used || result.dup_summary) && (
                <div className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2 space-y-1">
                  {result.summary && <div>{result.summary}</div>}
                  {result.dup_summary && <div className="font-medium text-gray-700">{result.dup_summary}</div>}
                  <div className="flex items-center gap-1 text-purple-400">
                    <Sparkles className="w-3 h-3" />
                    <span>由 {result.model_used || 'AI智能归类'} 分析</span>
                    {result.tokens && <span className="ml-1">· {result.tokens.toLocaleString()} tokens</span>}
                  </div>
                  <div className="text-gray-400">已自动归类：✅ 建议加入已默认勾选，⛔ 已去重默认不勾（可手动调整）</div>
                </div>
              )}

              {/* 指令建议列表（可编辑） */}
              {result.prompt_additions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600">建议写入 AI 指令（勾选后会追加到上方指令框）</div>
                  {result.prompt_additions.map((p, i) => (
                    <div key={i} className={`rounded-lg border transition-all ${
                      selectedPrompts[i] ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
                    }`}>
                      {editingPromptIdx === i ? (
                        // 编辑模式
                        <div className="p-2 space-y-2">
                          <textarea
                            value={editDraftPrompt}
                            onChange={e => setEditDraftPrompt(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full text-xs border border-purple-300 rounded px-2 py-1 resize-none focus:outline-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingPromptIdx(null)}
                              className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                            <button onClick={() => savePromptEdit(i)}
                              className="text-xs text-purple-600 px-2 py-0.5 rounded hover:bg-purple-100">保存</button>
                          </div>
                        </div>
                      ) : (
                        // 查看模式
                        <div className="flex items-start gap-2 px-3 py-2">
                          <button onClick={() => setSelectedPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })}
                            className="flex-shrink-0 mt-0.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              selectedPrompts[i] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                            }`}>{selectedPrompts[i] && <Check className="w-3 h-3 text-white" />}</div>
                          </button>
                          <div className="flex-1 min-w-0">
                            {p.action === 'merge' && p.original ? (
                              <>
                                <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                <span className="block text-xs text-gray-400 line-through whitespace-pre-wrap">{p.original}</span>
                                <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                <span className={`block text-xs whitespace-pre-wrap ${selectedPrompts[i] ? 'text-purple-800 font-medium' : 'text-gray-400 line-through'}`}>{p.content}</span>
                              </>
                            ) : (
                              <span className={`block text-xs whitespace-pre-wrap ${
                                selectedPrompts[i] ? 'text-purple-800' : 'text-gray-400 line-through'
                              }`}>{p.content}</span>
                            )}
                            {p.dedup_reason && (
                              <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                p.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : p.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                              }`}>
                                {p.recommendation === 'skip' ? '⛔ ' : p.action === 'merge' ? '✂️ ' : '✅ '}{p.dedup_reason}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { setEditingPromptIdx(i); setEditDraftPrompt(p.content); }}
                            className="flex-shrink-0 text-gray-300 hover:text-purple-500 ml-1">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 知识库条目列表（可编辑） */}
              {result.kb_items.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600">
                    建议写入知识库
                    {!kbId && <span className="text-amber-500 ml-1">(请先在下方绑定知识库)</span>}
                  </div>
                  {result.kb_items.map((item, i) => (
                    <div key={i} className={`rounded-lg border transition-all ${
                      selectedKbs[i] ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                    }`}>
                      {editingKbIdx === i ? (
                        // 编辑模式
                        <div className="p-2 space-y-2">
                          <div>
                            <div className="text-xs text-gray-400 mb-0.5">Q 问题</div>
                            <input
                              value={editDraftQ}
                              onChange={e => setEditDraftQ(e.target.value)}
                              autoFocus
                              className="w-full text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-0.5">A 答案</div>
                            <textarea
                              value={editDraftA}
                              onChange={e => setEditDraftA(e.target.value)}
                              rows={3}
                              className="w-full text-xs border border-blue-300 rounded px-2 py-1 resize-none focus:outline-none"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingKbIdx(null)}
                              className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                            <button onClick={() => saveKbEdit(i)}
                              className="text-xs text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100">保存</button>
                          </div>
                        </div>
                      ) : (
                        // 查看模式
                        <div className="flex items-start gap-2 px-3 py-2">
                          <button onClick={() => setSelectedKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })}
                            className="flex-shrink-0 mt-0.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              selectedKbs[i] ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                            }`}>{selectedKbs[i] && <Check className="w-3 h-3 text-white" />}</div>
                          </button>
                          <div className="flex-1 text-xs min-w-0">
                            {item.action === 'merge' && (item.originalAnswer || item.originalQuestion) ? (
                              <>
                                <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                <div className="text-gray-400 line-through">Q: {item.originalQuestion}</div>
                                <div className="text-gray-400 line-through mt-0.5">A: {item.originalAnswer}</div>
                                <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                <div className={`font-medium ${ selectedKbs[i] ? 'text-blue-800' : 'text-gray-400 line-through' }`}>Q: {item.question}</div>
                                <div className={`mt-0.5 ${ selectedKbs[i] ? 'text-blue-600' : 'text-gray-400 line-through' }`}>A: {item.answer}</div>
                              </>
                            ) : (
                              <>
                                <div className={`font-medium ${ selectedKbs[i] ? 'text-blue-800' : 'text-gray-400 line-through' }`}>Q: {item.question}</div>
                                <div className={`mt-0.5 ${ selectedKbs[i] ? 'text-blue-600' : 'text-gray-400 line-through' }`}>A: {item.answer}</div>
                              </>
                            )}
                            {item.dedup_reason && (
                              <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                item.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : item.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                              }`}>
                                {item.recommendation === 'skip' ? '⛔ ' : item.action === 'merge' ? '✂️ ' : '✅ '}{item.dedup_reason}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { setEditingKbIdx(i); setEditDraftQ(item.question); setEditDraftA(item.answer); }}
                            className="flex-shrink-0 text-gray-300 hover:text-blue-500 ml-1">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
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

function ChannelConfigTab({ channel, onJumpToKb }: { channel: Channel; onJumpToKb?: () => void }) {
  const isApp = channel.channel_type === "app";

  // 通用配置
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("收到，AI 正在思考中，请稍候...");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [kbId, setKbId] = useState(0);
  const [contextRounds, setContextRounds] = useState(10);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  // 平台公共库（多选调用）
  const [sharedKbList, setSharedKbList] = useState<{ id: number; name: string; item_count: number }[]>([]);
  const [boundSharedKbIds, setBoundSharedKbIds] = useState<number[]>([]);
  const [savingSharedKb, setSavingSharedKb] = useState(false);

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

  // 结构化指令条目
  interface PromptRule {
    id: number;
    channel_id: number;
    layer: number;
    category: string;
    content: string;
    enabled: number;
    sort_order: number;
    remark: string;
    created_at: string;
    updated_at: string;
  }
  const [promptRules, setPromptRules] = useState<PromptRule[]>([]);
  const [promptRulesOpen, setPromptRulesOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [newRule, setNewRule] = useState({ layer: 2, category: "行为规则", content: "", remark: "" });
  const [savingRule, setSavingRule] = useState(false);
  const [editRuleDraft, setEditRuleDraft] = useState<Partial<PromptRule>>({});

  const PROMPT_CATEGORIES = ["角色定义", "知识库规则", "回复格式", "语气风格", "安全边界"];

  async function loadPromptRules() {
    try {
      const res = await fetch(`/api/wecom/channels/${channel.id}/prompt-rules`);
      const d = await res.json();
      if (d.rules) setPromptRules(d.rules);
    } catch {}
  }

  async function handleAddRule() {
    if (!newRule.content.trim()) return;
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${channel.id}/prompt-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      });
      const d = await res.json();
      if (d.rule) {
        setPromptRules(prev => [...prev, d.rule]);
        setNewRule({ layer: 2, category: "行为规则", content: "", remark: "" });
        setAddingRule(false);
        toast.success("指令已添加");
      } else toast.error(d.error || "添加失败");
    } catch { toast.error("网络错误"); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(rule: PromptRule) {
    const newEnabled = rule.enabled ? 0 : 1;
    try {
      const res = await fetch(`/api/wecom/channels/${channel.id}/prompt-rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const d = await res.json();
      if (d.rule) setPromptRules(prev => prev.map(r => r.id === rule.id ? d.rule : r));
    } catch { toast.error("网络错误"); }
  }

  async function handleSaveRule(ruleId: number) {
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${channel.id}/prompt-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editRuleDraft),
      });
      const d = await res.json();
      if (d.rule) {
        setPromptRules(prev => prev.map(r => r.id === ruleId ? d.rule : r));
        setEditingRuleId(null);
        setEditRuleDraft({});
        toast.success("已保存");
      } else toast.error(d.error || "保存失败");
    } catch { toast.error("网络错误"); }
    finally { setSavingRule(false); }
  }

  async function handleDeleteRule(ruleId: number) {
    if (!confirm("确认删除这条指令？")) return;
    try {
      await fetch(`/api/wecom/channels/${channel.id}/prompt-rules/${ruleId}`, { method: "DELETE" });
      setPromptRules(prev => prev.filter(r => r.id !== ruleId));
      toast.success("已删除");
    } catch { toast.error("网络错误"); }
  }

  // 生成最终拼接的System Prompt预览
  function buildPromptPreview() {
    const layer1 = promptRules.filter(r => r.layer === 1 && r.enabled);
    const layer2 = promptRules.filter(r => r.layer === 2 && r.enabled);
    const parts: string[] = [];
    if (layer1.length > 0) parts.push("【角色定义】\n" + layer1.map(r => r.content).join("\n"));
    if (layer2.length > 0) parts.push("【行为规则】\n" + layer2.map((r, i) => `${i + 1}. ${r.content}`).join("\n"));
    return parts.join("\n\n") || "（暂无启用的指令）";
  }

  // 脏数据检测：保存后快照，有改动才点亮保存按钮
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [justSaved, setJustSaved] = useState(false);

  // 各字段的编辑态控制：平时只读，点编辑才可修改
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  // 编辑时的临时値（取消时可恢复）
  const [draftWelcome, setDraftWelcome] = useState("");
  const [draftWaiting, setDraftWaiting] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");

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
    // 加载结构化指令条目
    loadPromptRules();
    // 加载平台公共库列表与该分身已绑定关系（仅客服分身）
    if (!isApp && channel.id) {
      fetch('/api/wecom/shared-kbs').then(r => r.json()).then((d) => {
        if (Array.isArray(d)) setSharedKbList(d.map((k: any) => ({ id: k.id, name: k.name, item_count: Number(k.item_count || 0) })));
      }).catch(() => {});
      fetch(`/api/wecom/channels/${channel.id}/shared-kbs`).then(r => r.json()).then((d) => {
        if (d && Array.isArray(d.kb_ids)) setBoundSharedKbIds(d.kb_ids);
      }).catch(() => {});
    }
  }, [channel.id, isApp]);

  async function toggleSharedKb(kbIdToToggle: number) {
    const next = boundSharedKbIds.includes(kbIdToToggle)
      ? boundSharedKbIds.filter(id => id !== kbIdToToggle)
      : [...boundSharedKbIds, kbIdToToggle];
    setBoundSharedKbIds(next);
    setSavingSharedKb(true);
    try {
      await fetch(`/api/wecom/channels/${channel.id}/shared-kbs`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kb_ids: next }),
      });
    } catch { toast.error('保存失败'); } finally { setSavingSharedKb(false); }
  }

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
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">欢迎语</label>
          {!editingWelcome ? (
            <button onClick={() => { setDraftWelcome(welcomeMsg); setEditingWelcome(true); }}
              className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">编辑</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setWelcomeMsg(draftWelcome); setEditingWelcome(false); }}
                className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-50">取消</button>
              <button onClick={() => setEditingWelcome(false)}
                className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">完成</button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">用户首次发消息时自动回复，留空则不发送</p>
        {editingWelcome ? (
          <textarea
            value={welcomeMsg}
            onChange={e => setWelcomeMsg(e.target.value)}
            placeholder="输入欢迎语，支持换行"
            rows={3}
            autoFocus
            className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-800 placeholder-gray-400"
          />
        ) : (
          <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 min-h-[60px] whitespace-pre-wrap">
            {welcomeMsg || <span className="text-gray-400">未设置欢迎语</span>}
          </div>
        )}
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">等待提示语</label>
          {!editingWaiting ? (
            <button onClick={() => { setDraftWaiting(waitingMsg); setEditingWaiting(true); }}
              className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">编辑</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setWaitingMsg(draftWaiting); setEditingWaiting(false); }}
                className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-50">取消</button>
              <button onClick={() => setEditingWaiting(false)}
                className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">完成</button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">用户发消息后、AI 回复前显示的提示，避免用户以为没反应</p>
        {editingWaiting ? (
          <input
            value={waitingMsg}
            onChange={e => setWaitingMsg(e.target.value)}
            placeholder="例如：收到，AI 正在思考中，请稍候..."
            autoFocus
            className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        ) : (
          <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            {waitingMsg || <span className="text-gray-400">未设置等待提示语</span>}
          </div>
        )}
      </div>

      {/* 结构化 AI 指令管理 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* 折叠头部 */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          onClick={() => setPromptRulesOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-800">AI 指令管理</span>
            <span className="text-xs text-gray-400">
              第1层 {promptRules.filter(r=>r.layer===1).length}条·第2层 {promptRules.filter(r=>r.layer===2&&r.enabled).length}/{promptRules.filter(r=>r.layer===2).length}条启用
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${promptRulesOpen ? 'rotate-180' : ''}`} />
        </button>

        {promptRulesOpen && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">

            {/* 搜索查重 */}
            <div className="relative">
              <input
                type="text"
                value={ruleSearch}
                onChange={e => setRuleSearch(e.target.value)}
                placeholder="搜索指令内容（查重用）..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {ruleSearch && (
                <button onClick={() => setRuleSearch('')} className="absolute right-2 top-2 text-gray-400"><X className="w-4 h-4" /></button>
              )}
            </div>

            {/* 第一层：角色定义 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-purple-400 rounded-full inline-block"></span>
                  <span className="text-xs font-semibold text-gray-700">第一层·角色定义</span>
                  <span className="text-xs text-gray-400">你是谁、你的边界</span>
                </div>
                <button
                  onClick={() => { setAddingRule(true); setNewRule({ layer: 1, category: '角色定义', content: '', remark: '' }); }}
                  className="text-xs text-purple-500 flex items-center gap-0.5 hover:bg-purple-50 px-2 py-0.5 rounded"
                ><Plus className="w-3 h-3" />新增</button>
              </div>
              {promptRules.filter(r => r.layer === 1 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.remark?.includes(ruleSearch))).length === 0 && (
                <div className="text-xs text-gray-400 py-2 text-center bg-gray-50 rounded-lg">暂无角色定义，建议添加一条</div>
              )}
              {promptRules.filter(r => r.layer === 1 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.remark?.includes(ruleSearch))).map(rule => (
                <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  {editingRuleId === rule.id ? (
                    <div className="p-3 space-y-2">
                      <textarea
                        value={editRuleDraft.content ?? rule.content}
                        onChange={e => setEditRuleDraft(d => ({...d, content: e.target.value}))}
                        rows={3}
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editRuleDraft.remark ?? rule.remark}
                        onChange={e => setEditRuleDraft(d => ({...d, remark: e.target.value}))}
                        placeholder="备注（例：2025-06-22 修改：加强知识库优先级）"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditingRuleId(null); setEditRuleDraft({}); }} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                        <button onClick={() => handleSaveRule(rule.id)} disabled={savingRule} className="text-xs text-white bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50">保存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{rule.content}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleToggleRule(rule)}>
                            {rule.enabled ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                          </button>
                          <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                      <p className="text-xs text-gray-300 mt-1">更新：{new Date(rule.updated_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 第二层：行为规则 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-blue-400 rounded-full inline-block"></span>
                  <span className="text-xs font-semibold text-gray-700">第二层·行为规则</span>
                  <span className="text-xs text-gray-400">知识库/回复/语气/安全</span>
                </div>
                <button
                  onClick={() => { setAddingRule(true); setNewRule({ layer: 2, category: '行为规则', content: '', remark: '' }); }}
                  className="text-xs text-blue-500 flex items-center gap-0.5 hover:bg-blue-50 px-2 py-0.5 rounded"
                ><Plus className="w-3 h-3" />新增</button>
              </div>
              {promptRules.filter(r => r.layer === 2 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.category.includes(ruleSearch) || r.remark?.includes(ruleSearch))).length === 0 && (
                <div className="text-xs text-gray-400 py-2 text-center bg-gray-50 rounded-lg">暂无行为规则</div>
              )}
              {promptRules.filter(r => r.layer === 2 && (ruleSearch === '' || r.content.includes(ruleSearch) || r.category.includes(ruleSearch) || r.remark?.includes(ruleSearch))).map(rule => (
                <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? 'border-blue-200 bg-blue-50/20' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  {editingRuleId === rule.id ? (
                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={editRuleDraft.category ?? rule.category}
                          onChange={e => setEditRuleDraft(d => ({...d, category: e.target.value}))}
                          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                        >
                          {PROMPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <textarea
                        value={editRuleDraft.content ?? rule.content}
                        onChange={e => setEditRuleDraft(d => ({...d, content: e.target.value}))}
                        rows={3}
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editRuleDraft.remark ?? rule.remark}
                        onChange={e => setEditRuleDraft(d => ({...d, remark: e.target.value}))}
                        placeholder="备注（例：2025-06-22 修改：加强知识库优先级）"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditingRuleId(null); setEditRuleDraft({}); }} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                        <button onClick={() => handleSaveRule(rule.id)} disabled={savingRule} className="text-xs text-white bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50">保存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded mr-1.5 ${
                            rule.category === '知识库规则' ? 'bg-green-100 text-green-700' :
                            rule.category === '回复格式' ? 'bg-orange-100 text-orange-700' :
                            rule.category === '语气风格' ? 'bg-pink-100 text-pink-700' :
                            rule.category === '安全边界' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{rule.category}</span>
                          <span className="text-sm text-gray-800 whitespace-pre-wrap">{rule.content}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleToggleRule(rule)}>
                            {rule.enabled ? <ToggleRight className="w-6 h-6 text-blue-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                          </button>
                          <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                      <p className="text-xs text-gray-300 mt-1">更新：{new Date(rule.updated_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 第三层：知识库概览入口 */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-4 bg-green-400 rounded-full inline-block"></span>
                <span className="text-xs font-semibold text-gray-700">第三层·知识库</span>
                <span className="text-xs text-gray-400">问答内容，匹配后自动注入指令</span>
              </div>
              <button
                onClick={() => onJumpToKb?.()}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-green-200 bg-green-50/40 text-sm text-green-700 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>知识库管理</span>
                  {kbList.length > 0 && (
                    <span className="text-xs text-gray-500">已绑定：{kbList.find(kb=>kb.id===kbId)?.name || '未绑定'}·{kbList.find(kb=>kb.id===kbId)?.item_count || 0}条</span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-green-400" />
              </button>
            </div>

            {/* 新增指令弹层 */}
            {addingRule && (
              <div className="border border-blue-200 rounded-xl p-3 bg-blue-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">新增指令</span>
                  <button onClick={() => setAddingRule(false)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={newRule.layer}
                    onChange={e => setNewRule(r => ({...r, layer: Number(e.target.value), category: Number(e.target.value) === 1 ? '角色定义' : '行为规则'}))}
                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                  >
                    <option value={1}>第1层·角色定义</option>
                    <option value={2}>第2层·行为规则</option>
                  </select>
                  {newRule.layer === 2 && (
                    <select
                      value={newRule.category}
                      onChange={e => setNewRule(r => ({...r, category: e.target.value}))}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none flex-1"
                    >
                      {PROMPT_CATEGORIES.filter(c=>c!=='角色定义').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                {/* 搜索相似条目提示 */}
                {newRule.content.length > 4 && (() => {
                  const similar = promptRules.filter(r => r.content.includes(newRule.content.slice(0,6)) || newRule.content.includes(r.content.slice(0,6)));
                  return similar.length > 0 ? (
                    <div className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1.5">
                      ⚠️ 发现相似条目：「{similar[0].content.slice(0,30)}...」，请确认是否重复
                    </div>
                  ) : null;
                })()}
                <textarea
                  value={newRule.content}
                  onChange={e => setNewRule(r => ({...r, content: e.target.value}))}
                  placeholder={newRule.layer === 1 ? "例：你是一名专业的康宝莱健康顾问，性格亲切、专业..." : "例：如果知识库有相关内容，必须严格按照知识库答案回复..."}
                  rows={3}
                  className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 resize-none focus:outline-none"
                />
                <input
                  type="text"
                  value={newRule.remark}
                  onChange={e => setNewRule(r => ({...r, remark: e.target.value}))}
                  placeholder={`备注（例：${new Date().toLocaleDateString('zh-CN')} 新增：初始角色设定）`}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAddingRule(false)} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                  <button onClick={handleAddRule} disabled={savingRule || !newRule.content.trim()} className="text-xs text-white bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50">
                    {savingRule ? '保存中...' : '添加指令'}
                  </button>
                </div>
              </div>
            )}

            {/* 实时预览 */}
            <div>
              <button
                onClick={() => setPromptPreviewOpen(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${promptPreviewOpen ? 'rotate-180' : ''}`} />
                实时预览（发给 AI 的完整指令文本）
              </button>
              {promptPreviewOpen && (
                <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto border border-gray-200">{buildPromptPreview()}</pre>
              )}
            </div>

          </div>
        )}
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

      {/* 调用平台公共库（客服账号·多选） */}
      {!isApp && sharedKbList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">调用平台公共库</label>
            {savingSharedKb && <Loader2 className="w-3.5 h-3.5 animate-spin text-green-500" />}
          </div>
          <p className="text-xs text-gray-400 mb-2.5">勾选后，该分身回答时会一并检索这些公共库的内容（可多选，自动保存）</p>
          <div className="space-y-2">
            {sharedKbList.map(kb => {
              const checked = boundSharedKbIds.includes(kb.id);
              return (
                <button
                  key={kb.id}
                  onClick={() => toggleSharedKb(kb.id)}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${
                    checked ? "border-green-400 bg-green-50" : "border-gray-200"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}>{checked && <Check className="w-3 h-3 text-white" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${checked ? 'text-green-700' : 'text-gray-700'}`}>{kb.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{kb.item_count} 条内容</div>
                  </div>
                </button>
              );
            })}
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
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");

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
      const res = await fetch(`/api/wecom/ch/users?channel_type=${channelType}`);
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
                {/* 全部用户 / 指定用户 切换 */}
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
                {/* 指定用户时显示可搜索下拉多选框 */}
                {form.target_type === "selected" && (
                  <div className="relative">
                    {/* 触发按鈕 */}
                    <button
                      type="button"
                      onClick={() => { setUserDropdownOpen(v => !v); setUserSearch(""); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border-2 transition-all ${
                        form.selected_user_ids.length > 0
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-500"
                      }`}
                    >
                      <span>
                        {form.selected_user_ids.length === 0
                          ? "点击选择用户…"
                          : `已选 ${form.selected_user_ids.length} 个用户`}
                      </span>
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    </button>
                    {/* 下拉面板 */}
                    {userDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg">
                        {/* 搜索框 */}
                        <div className="px-3 pt-2.5 pb-1.5">
                          <input
                            type="text"
                            placeholder="搜索用户名或 ID…"
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                          />
                        </div>
                        {/* 用户列表 */}
                        <div className="max-h-52 overflow-y-auto py-1">
                          {wecomUsers2
                            .filter(u => !userSearch || (u.nickname || u.wecom_user_id).toLowerCase().includes(userSearch.toLowerCase()))
                            .map(u => (
                              <label
                                key={u.wecom_user_id}
                                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.selected_user_ids.includes(u.wecom_user_id)}
                                  onChange={() => toggleUserSelect(u.wecom_user_id)}
                                  className="w-4 h-4 accent-blue-600 flex-shrink-0"
                                />
                                {u.avatar_url ? (
                                  <img src={u.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" alt="" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                    <User className="w-3.5 h-3.5 text-gray-400" />
                                  </div>
                                )}
                                <span className="text-sm text-gray-700 truncate">{u.nickname || u.wecom_user_id}</span>
                              </label>
                            ))}
                          {wecomUsers2.filter(u => !userSearch || (u.nickname || u.wecom_user_id).toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                            <div className="text-xs text-gray-400 text-center py-4">暂无匹配用户</div>
                          )}
                        </div>
                        {/* 底部操作栏 */}
                        <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-gray-400">已选 {form.selected_user_ids.length} 个</span>
                          <div className="flex gap-2">
                            {form.selected_user_ids.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setForm(p => ({ ...p, selected_user_ids: [] }))}
                                className="text-xs text-red-500 hover:text-red-600"
                              >
                                清除
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setUserDropdownOpen(false)}
                              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                            >
                              确定
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

function ChannelKnowledgeTab({ channelType, channelId, kbId: explicitKbId }: { channelType: string; channelId?: number; kbId?: number }) {
  // 统一的库定位查询串：优先用显式 kbId（公共库场景），否则按渠道
  const kbQuery = explicitKbId ? `kb_id=${explicitKbId}` : (channelId ? `channel_id=${channelId}` : `channel_type=${channelType}`);
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

  // ── 第0步：AI智能整理 ──
  const [step0Open, setStep0Open] = useState(false);
  const [step0Input, setStep0Input] = useState("");
  const [step0Analyzing, setStep0Analyzing] = useState(false);
  const [step0Result, setStep0Result] = useState<AiAssistResult | null>(null);
  const [step0SelPrompts, setStep0SelPrompts] = useState<boolean[]>([]);
  const [step0SelKbs, setStep0SelKbs] = useState<boolean[]>([]);
  const [step0Applying, setStep0Applying] = useState(false);
  const [step0Done, setStep0Done] = useState(false);
  const [step0KbId, setStep0KbId] = useState<number>(0);
  // 编辑状态
  const [step0EditPromptIdx, setStep0EditPromptIdx] = useState<number | null>(null);
  const [step0EditKbIdx, setStep0EditKbIdx] = useState<number | null>(null);
  const [step0EditDraftPrompt, setStep0EditDraftPrompt] = useState("");
  const [step0EditDraftQ, setStep0EditDraftQ] = useState("");
  const [step0EditDraftA, setStep0EditDraftA] = useState("");

  // 加载kbId（通过channel-config接口；公共库场景直接用显式 kbId）
  useEffect(() => {
    if (explicitKbId) { setStep0KbId(explicitKbId); return; }
    if (!channelId) return;
    fetch(`/api/wecom/channel-config/${channelId}`)
      .then(r => r.json())
      .then(d => { if (d.knowledge_base_id) setStep0KbId(d.knowledge_base_id); })
      .catch(() => {});
  }, [channelId, explicitKbId]);

  async function handleStep0Analyze() {
    if (!step0Input.trim()) return;
    setStep0Analyzing(true);
    setStep0Result(null);
    setStep0Done(false);
    try {
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: step0Input, channelId: channelId || 0, kbId: step0KbId }),
      });
      const d = await res.json();
      if (d.ok) {
        setStep0Result(d);
        setStep0SelPrompts((d.prompt_additions || []).map((p: PromptAddition) => p.recommendation !== 'skip'));
        setStep0SelKbs((d.kb_items || []).map((k: KbItemResult) => k.recommendation !== 'skip'));
      } else {
        toast.error(d.error || "AI分析失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setStep0Analyzing(false);
    }
  }

  async function handleStep0Apply() {
    if (!step0Result) return;
    setStep0Applying(true);
    try {
      const chosenPrompts = step0Result.prompt_additions.filter((_, i) => step0SelPrompts[i]);
      const chosenKbs = step0Result.kb_items.filter((_, i) => step0SelKbs[i]);
      let promptSuccess = 0;
      let kbSuccess = 0;
      // 写入指令（prompt_rules layer=2）
      if (channelId && chosenPrompts.length > 0) {
        for (const p of chosenPrompts) {
          try {
            const r = await fetch(`/api/wecom/channels/${channelId}/prompt-rules`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ layer: 2, category: "行为规则", content: p.content }),
            });
            const rd = await r.json();
            if (rd.rule) promptSuccess++;
          } catch {}
        }
      }
      // 写入知识库
      if (step0KbId && chosenKbs.length > 0) {
        for (const item of chosenKbs) {
          try {
            const r = await fetch(`/api/wecom/knowledge-bases/${step0KbId}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_type: "qa", question: item.question, answer: item.answer }),
            });
            const rd = await r.json();
            if (rd.ok) kbSuccess++;
          } catch {}
        }
      }
      const msgs: string[] = [];
      if (chosenPrompts.length > 0) msgs.push(`${promptSuccess}/${chosenPrompts.length}条指令已写入行为规则`);
      if (chosenKbs.length > 0) {
        if (!step0KbId) msgs.push(`请先在「配置」Tab绑定知识库`);
        else msgs.push(`${kbSuccess}/${chosenKbs.length}条已写入知识库`);
      }
      if (msgs.length > 0) toast.success(msgs.join("；"));
      setStep0Done(true);
      setTimeout(() => { setStep0Result(null); setStep0Input(""); setStep0Done(false); loadData(); }, 1500);
    } catch {
      toast.error("写入失败");
    } finally {
      setStep0Applying(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [s, src] = await Promise.all([
        fetch(`/api/wecom/ch/kb/stats?${kbQuery}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/sources?${kbQuery}`).then(r => r.json()),
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
      if (explicitKbId) fd.append("kb_id", String(explicitKbId));
      else if (channelId) fd.append("channel_id", String(channelId));
      else fd.append("channel_type", channelType);
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
      const res = await fetch(`/api/wecom/ch/kb/export?${kbQuery}`);
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
          ...(explicitKbId ? { kb_id: explicitKbId } : (channelId ? { channel_id: channelId } : { channel_type: channelType })),
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
      const res = await fetch(`/api/wecom/ch/kb/source?${kbQuery}&source_file=${encodeURIComponent(sourceFile)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteSource(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function openSourceDetail(sourceFile: string) {
    setViewSource(sourceFile);
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/items?${kbQuery}&source_file=${encodeURIComponent(sourceFile)}`);
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
      {/* 第0步：AI智能整理 */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100 overflow-hidden">
        <button
          onClick={() => setStep0Open(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">0</span>
            </div>
            <span className="text-sm font-semibold text-gray-800">第0步· AI智能整理</span>
            <span className="text-xs text-purple-600 bg-purple-100 rounded px-1.5 py-0.5">推荐先做</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${step0Open ? 'rotate-90' : ''}`} />
        </button>

        {step0Open && (
          <div className="px-4 pb-4 space-y-3 border-t border-purple-100">
            <p className="text-xs text-gray-500 pt-3 leading-relaxed">
              粘贴任意内容（产品介绍、客服要求、价格表等），AI 自动判断并分别写入「角色行为规则」和「知识库」
            </p>

            <div className="relative">
              <textarea
                value={step0Input}
                onChange={e => setStep0Input(e.target.value)}
                placeholder="例如：客服要有耕心，不要用太官方的语气。我们的产品康宝莱F1单一99元，包含蛋白粉和维生素套餐。如果客户问价格，告诉他们具体套餐内容..."
                rows={5}
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 text-gray-800 placeholder-gray-400 bg-white"
              />
            </div>

            <button
              onClick={handleStep0Analyze}
              disabled={step0Analyzing || !step0Input.trim()}
              className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {step0Analyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" />分析中...</>
                : <><Sparkles className="w-4 h-4" />让 AI 帮我整理</>}
            </button>

            {step0Result && (
              <div className="space-y-3">
                {(step0Result.summary || step0Result.dup_summary) && (
                  <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2 space-y-1">
                    {step0Result.summary && (
                      <div className="flex items-start gap-1.5"><Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{step0Result.summary}</span></div>
                    )}
                    {step0Result.dup_summary && <div className="font-medium text-gray-700">{step0Result.dup_summary}</div>}
                    <div className="text-gray-400">已自动归类：✅ 建议加入已默认勾选，⛔ 已去重默认不勾（可手动调整）</div>
                  </div>
                )}

                {/* 角色/行为规则建议 */}
                {step0Result.prompt_additions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      建议写入「角色/行为规则」
                    </div>
                    {step0Result.prompt_additions.map((p, i) => (
                      <div key={i} className={`rounded-lg border transition-all ${
                        step0SelPrompts[i] ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                      }`}>
                        {step0EditPromptIdx === i ? (
                          <div className="p-2 space-y-2">
                            <textarea
                              value={step0EditDraftPrompt}
                              onChange={e => setStep0EditDraftPrompt(e.target.value)}
                              rows={3}
                              autoFocus
                              className="w-full text-xs border border-purple-300 rounded px-2 py-1 resize-none focus:outline-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditPromptIdx(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                              <button onClick={() => {
                                const updated = [...step0Result!.prompt_additions];
                                updated[i] = { ...updated[i], content: step0EditDraftPrompt };
                                setStep0Result({ ...step0Result!, prompt_additions: updated });
                                setStep0EditPromptIdx(null);
                              }} className="text-xs text-purple-600 px-2 py-0.5 rounded hover:bg-purple-100">保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                step0SelPrompts[i] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                              }`}>{step0SelPrompts[i] && <Check className="w-3 h-3 text-white" />}</div>
                            </button>
                            <div className="flex-1 min-w-0">
                              {p.action === 'merge' && p.original ? (
                                <>
                                  <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                  <span className="block text-xs text-gray-400 line-through whitespace-pre-wrap">{p.original}</span>
                                  <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                  <span className={`block text-xs whitespace-pre-wrap ${step0SelPrompts[i] ? 'text-purple-800 font-medium' : 'text-gray-400 line-through'}`}>{p.content}</span>
                                </>
                              ) : (
                                <span className={`block text-xs whitespace-pre-wrap ${
                                  step0SelPrompts[i] ? 'text-purple-800' : 'text-gray-400 line-through'
                                }`}>{p.content}</span>
                              )}
                              {p.dedup_reason && (
                                <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                  p.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : p.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                                }`}>{p.recommendation === 'skip' ? '⛔ ' : p.action === 'merge' ? '✂️ ' : '✅ '}{p.dedup_reason}</div>
                              )}
                            </div>
                            <button onClick={() => { setStep0EditPromptIdx(i); setStep0EditDraftPrompt(p.content); }} className="flex-shrink-0 text-gray-300 hover:text-purple-500">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 知识库条目建议 */}
                {step0Result.kb_items.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      建议写入「知识库」
                      {!step0KbId && <span className="text-amber-500 font-normal ml-1">(请先在「配置」Tab绑定知识库)</span>}
                    </div>
                    {step0Result.kb_items.map((item, i) => (
                      <div key={i} className={`rounded-lg border transition-all ${
                        step0SelKbs[i] ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                      }`}>
                        {step0EditKbIdx === i ? (
                          <div className="p-2 space-y-2">
                            <div>
                              <div className="text-xs text-gray-400 mb-0.5">Q 问题</div>
                              <input value={step0EditDraftQ} onChange={e => setStep0EditDraftQ(e.target.value)} autoFocus className="w-full text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-400 mb-0.5">A 答案</div>
                              <textarea value={step0EditDraftA} onChange={e => setStep0EditDraftA(e.target.value)} rows={3} className="w-full text-xs border border-blue-300 rounded px-2 py-1 resize-none focus:outline-none" />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditKbIdx(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                              <button onClick={() => {
                                const updated = [...step0Result!.kb_items];
                                updated[i] = { ...updated[i], question: step0EditDraftQ, answer: step0EditDraftA };
                                setStep0Result({ ...step0Result!, kb_items: updated });
                                setStep0EditKbIdx(null);
                              }} className="text-xs text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100">保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                step0SelKbs[i] ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                              }`}>{step0SelKbs[i] && <Check className="w-3 h-3 text-white" />}</div>
                            </button>
                            <div className="flex-1 text-xs min-w-0">
                              {item.action === 'merge' && (item.originalAnswer || item.originalQuestion) ? (
                                <>
                                  <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                  <div className="text-gray-400 line-through">Q: {item.originalQuestion}</div>
                                  <div className="text-gray-400 line-through mt-0.5">A: {item.originalAnswer}</div>
                                  <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                  <div className={`font-medium ${ step0SelKbs[i] ? 'text-blue-800' : 'text-gray-400 line-through' }`}>Q: {item.question}</div>
                                  <div className={`mt-0.5 ${ step0SelKbs[i] ? 'text-blue-600' : 'text-gray-400 line-through' }`}>A: {item.answer}</div>
                                </>
                              ) : (
                                <>
                                  <div className={`font-medium ${ step0SelKbs[i] ? 'text-blue-800' : 'text-gray-400 line-through' }`}>Q: {item.question}</div>
                                  <div className={`mt-0.5 ${ step0SelKbs[i] ? 'text-blue-600' : 'text-gray-400 line-through' }`}>A: {item.answer}</div>
                                </>
                              )}
                              {item.dedup_reason && (
                                <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                  item.recommendation === 'skip' ? 'bg-gray-100 text-gray-500' : item.action === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                                }`}>{item.recommendation === 'skip' ? '⛔ ' : item.action === 'merge' ? '✂️ ' : '✅ '}{item.dedup_reason}</div>
                              )}
                            </div>
                            <button onClick={() => { setStep0EditKbIdx(i); setStep0EditDraftQ(item.question); setStep0EditDraftA(item.answer); }} className="flex-shrink-0 text-gray-300 hover:text-blue-500">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(step0Result.prompt_additions.length > 0 || step0Result.kb_items.length > 0) && (
                  <button
                    onClick={handleStep0Apply}
                    disabled={step0Applying || step0Done}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      step0Done ? 'bg-green-500 text-white' : 'bg-gray-800 text-white disabled:opacity-50'
                    }`}
                  >
                    {step0Applying ? <><Loader2 className="w-4 h-4 animate-spin" />写入中...</>
                    : step0Done ? <><Check className="w-4 h-4" />已全部写入</>
                    : <><Check className="w-4 h-4" />确认写入勾选内容</>}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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

function ChannelLogsTab({ channelType, channelId }: { channelType: string, channelId?: number }) {
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
    if (channelId) params.set("channel_id", String(channelId));
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
        body: JSON.stringify({ channel_type: channelType, channel_id: channelId, question: s.question, similar_questions: s.similar_questions || "", answer: s.answer }),
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


// ═══════════════════════════════════════════════════════════════════════════════
// 文档 Tab：AI 智库 4 层架构系统设计文档
// ═══════════════════════════════════════════════════════════════════════════════

function DocsTab() {
  const [openSection, setOpenSection] = useState<string | null>("overview");

  const sections = [
    {
      id: "overview",
      title: "架构总览",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            「AI 智库」将 AI 的认知和行为逻辑清晰划分为 4 个层级，从「自我认知」到「自我能力」，再到「客户认知」，形成完整的对话系统架构。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-blue-100 px-2 py-1.5 text-left font-semibold text-blue-800">层级</th>
                  <th className="border border-blue-100 px-2 py-1.5 text-left font-semibold text-blue-800">名称</th>
                  <th className="border border-blue-100 px-2 py-1.5 text-left font-semibold text-blue-800">核心作用</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["①", "角色定义 & 行为规则", "AI 的基础人设与规则，决定「我是谁」「我怎么说话」"],
                  ["②", "我的数字分身", "客服本人的风格克隆，通过优质对话语料提炼说话风格"],
                  ["③", "知识库", "标准答案库，含平台共享知识库和客服私人知识库"],
                  ["④", "历史对话记忆", "AI 对「客户是谁」的理解，含长期偏好记忆和短期上下文"],
                ].map(([num, name, desc]) => (
                  <tr key={num} className="hover:bg-gray-50">
                    <td className="border border-gray-100 px-2 py-1.5 font-bold text-blue-600 text-center">{num}</td>
                    <td className="border border-gray-100 px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap">{name}</td>
                    <td className="border border-gray-100 px-2 py-1.5 text-gray-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "layer1",
      title: "① 角色定义 & 行为规则",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="font-semibold text-blue-800 mb-1">本质：AI 的基础人设与规则</div>
            <p>决定 AI「我是谁」「我怎么说话」「我必须遵守什么规则」（如不主动报价等）。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">数据库表</div>
            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_prompt_rules</code>
            <span className="text-xs text-gray-500 ml-2">layer=1（系统级，只读）/ layer=2（自定义指令）</span>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">Prompt 拼装位置</div>
            <p className="text-xs text-gray-600">最先注入，作为 System Prompt 的基础框架。layer1 直接拼接，layer2 以「行为规则：1. 2. 3.」格式追加。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">生命周期</div>
            <p className="text-xs text-gray-600">静态配置，很少改变。由管理员在「AI 智库 → 第①层」中编辑。</p>
          </div>
        </div>
      ),
    },
    {
      id: "layer2",
      title: "② 我的数字分身",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
            <div className="font-semibold text-green-800 mb-1">本质：客服本人的风格克隆</div>
            <p>通过学习客服历史优质对话，提炼其说话风格和专业积累，让 AI 说话像这个客服本人。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">数据库表</div>
            <div className="space-y-1">
              <div><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_corpus</code><span className="text-xs text-gray-500 ml-2">语料库（含 quality 标注字段）</span></div>
              <div><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_digital_twin</code><span className="text-xs text-gray-500 ml-2">分身配置（enabled 开关、version、last_trained_at）</span></div>
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">Prompt 拼装位置（待接入）</div>
            <p className="text-xs text-gray-600">在 layer1/2 之后、知识库之前注入。检索 quality=1 的优质语料，以「参考回复风格」格式注入。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">护城河设计</div>
            <p className="text-xs text-gray-600">客户端只展示统计概览（优质语料数、版本、场景标签），不展示具体语料内容。语料积累越多，AI 越像本人，形成竞争壁垒。</p>
          </div>
        </div>
      ),
    },
    {
      id: "layer3",
      title: "③ 知识库",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
            <div className="font-semibold text-yellow-800 mb-1">本质：标准答案库</div>
            <p>包含平台提供的「共享知识库」和客服上传的「私人知识库」，提供精准的标准答案。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">数据库表</div>
            <div className="space-y-1">
              <div><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_knowledge_bases</code><span className="text-xs text-gray-500 ml-2">知识库（is_system=1 为共享）</span></div>
              <div><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_knowledge_items</code><span className="text-xs text-gray-500 ml-2">知识条目（question + answer）</span></div>
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">检索逻辑</div>
            <p className="text-xs text-gray-600">优先按问题字段关键词匹配，命中不足 3 条时补充答案字段匹配，最终取前 5 条，以「知识库标准答案——必须优先使用」格式注入。</p>
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">向量化方案</div>
            <p className="text-xs text-gray-600">当前采用 MySQL JSON 存储向量，已为将来升级 ChromaDB / Qdrant 预留扩展空间。</p>
          </div>
        </div>
      ),
    },
    {
      id: "layer4",
      title: "④ 历史对话记忆",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <div className="font-semibold text-purple-800 mb-1">本质：AI 对「客户是谁」的理解</div>
            <p>包含两个时间维度：本轮对话的短期上下文（临时），以及历史对话提炼的长期偏好记忆（持久化，规划中）。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">维度</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">时间范围</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">存储</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-100 px-2 py-1.5">本轮上下文</td>
                  <td className="border border-gray-100 px-2 py-1.5">最近 N 句</td>
                  <td className="border border-gray-100 px-2 py-1.5">临时，不存库</td>
                  <td className="border border-gray-100 px-2 py-1.5 text-green-600 font-medium">已上线</td>
                </tr>
                <tr>
                  <td className="border border-gray-100 px-2 py-1.5">客户长期记忆</td>
                  <td className="border border-gray-100 px-2 py-1.5">全部历史</td>
                  <td className="border border-gray-100 px-2 py-1.5">持久化存库</td>
                  <td className="border border-gray-100 px-2 py-1.5 text-orange-500 font-medium">规划中</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-xs text-gray-600">
            <span className="font-medium text-gray-700">重要说明：</span>已启用数字分身（第②层）后，AI 可通过长期记忆理解用户偏好，短期上下文轮数的重要性自动降低。两者共同构成 AI 对客户的完整认知。
          </div>
          <div>
            <div className="font-medium text-gray-800 mb-1">数据库字段</div>
            <div><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">wecom_channel_config.context_rounds</code><span className="text-xs text-gray-500 ml-2">全局保留轮数设置</span></div>
          </div>
        </div>
      ),
    },
    {
      id: "prompt",
      title: "Prompt 拼装顺序规范",
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p className="text-xs text-gray-500">每次用户发消息时，后端按以下顺序组装 System Prompt 发送给 LLM：</p>
          <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-green-400 space-y-1">
            <div className="text-gray-400">// 第①层：角色定义 & 行为规则（静态）</div>
            <div>systemPrompt = layer1 + "\n\n行为规则：\n" + layer2</div>
            <div className="mt-2 text-gray-400">// 第②层：数字分身风格（若开启，动态检索）</div>
            <div>digitalTwinContext = "【参考回复风格】\n" + corpus</div>
            <div className="mt-2 text-gray-400">// 第③层：知识库标准答案（动态检索）</div>
            <div>kbContext = "【知识库标准答案——必须优先使用】\n" + items</div>
            <div className="mt-2 text-gray-400">// 最终拼装</div>
            <div className="text-yellow-300">fullSystemPrompt = systemPrompt + digitalTwinContext + kbContext</div>
          </div>
          <div className="text-xs text-gray-500 bg-yellow-50 rounded-lg p-2 border border-yellow-100">
            注：数字分身（digitalTwinContext）接入后端 Prompt 拼装流程尚在开发中，当前版本仅拼装 systemPrompt + kbContext。
          </div>
        </div>
      ),
    },
    {
      id: "roadmap",
      title: "开发路线图",
      content: (
        <div className="space-y-2">
          {[
            { status: "done", text: "客户数据 Tab（UsersTab + LogsTab 合并）" },
            { status: "done", text: "接入指引弹窗（SetupGuideModal，4 步骤）" },
            { status: "done", text: "AI 模型下拉框（7 个模型，DeepSeek / Manus 分组）" },
            { status: "done", text: "数字分身前端（DigitalTwinCard，统计概览 + 开关）" },
            { status: "done", text: "语料库后端（wecom_corpus + wecom_digital_twin 表）" },
            { status: "done", text: "语料库管理 Tab（WecomAdmin 渠道详情 CorpusTab）" },
            { status: "progress", text: "AI 智库 Tab 重构（4 层结构，移除 ConfigTab AI 指令）" },
            { status: "progress", text: "第④层历史对话记忆卡片（context_rounds 全局设置）" },
            { status: "todo", text: "数字分身接入后端 Prompt 拼装（digitalTwinContext）" },
            { status: "todo", text: "客户长期偏好记忆（历史对话提炼，持久化存库）" },
            { status: "todo", text: "向量检索升级（ChromaDB / Qdrant）" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
                item.status === "done" ? "bg-green-500" :
                item.status === "progress" ? "bg-blue-500" : "bg-gray-200"
              }`}>
                {item.status === "done" && <Check className="w-2.5 h-2.5 text-white" />}
                {item.status === "progress" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
              <span className={`text-xs leading-relaxed ${
                item.status === "done" ? "text-gray-500 line-through" :
                item.status === "progress" ? "text-blue-700 font-medium" : "text-gray-600"
              }`}>{item.text}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-4 space-y-3 pb-8">
      {/* 标题 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-5 h-5" />
          <span className="font-bold text-base">AI 智库系统设计文档</span>
        </div>
        <p className="text-xs text-blue-100 leading-relaxed">
          好友记企业微信客服管理平台 · 4 层 AI 大脑架构设计规范
        </p>
        <div className="mt-2 flex gap-2">
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">v1.0</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">2026-06-22</span>
        </div>
      </div>

      {/* 各章节折叠卡片 */}
      {sections.map(section => (
        <div key={section.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <button
            className="w-full px-4 py-3 flex items-center justify-between"
            onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
          >
            <span className="text-sm font-semibold text-gray-800">{section.title}</span>
            {openSection === section.id
              ? <ChevronDown className="w-4 h-4 text-gray-400" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
          {openSection === section.id && (
            <div className="px-4 pb-4 border-t border-gray-50">
              <div className="pt-3">{section.content}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 通知平台 Tab
// ═══════════════════════════════════════════════════════════════════════════════
function NotifyTab() {
  const [cfg, setCfg] = useState<Record<string, any>>({
    corpid: "wwbbaccf1da5f886d9",
    corpsecret: "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g",
    agentid: "1000002",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testUser, setTestUser] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [members, setMembers] = useState<{ userid: string; name: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const notifyItems = [
    { key: "notify_collateral_gap", label: "担保缺口预警", desc: "订单担保缺口超过阈值时推送给资方" },
    { key: "notify_interest_due", label: "结息提醒", desc: "结息日前 N 天提醒用户" },
    { key: "notify_order_created", label: "新订单通知", desc: "管理员创建订单后通知对应用户" },
    { key: "notify_order_settled", label: "订单结清通知", desc: "订单结清时通知用户" },
    { key: "notify_price_drop", label: "价格大幅下跌预警", desc: "某币种跌幅超过设定值时推送风险提示" },
  ];

  useEffect(() => {
    fetch("/api/admin/wecom/notify-config", {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth-token") || ""}` }
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setCfg(d.config || {}); })
      .catch(() => {});
    // 加载企业微信成员列表（复用已有接口）
    setLoadingMembers(true);
    fetch("/api/wecom/wecom-users", {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth-token") || ""}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d.users) {
          setMembers(d.users.map((u: any) => ({ userid: u.wecom_user_id, name: u.wecom_user_id })));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/wecom/notify-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth-token") || ""}` },
        body: JSON.stringify(cfg)
      });
      const d = await r.json();
      setMsg(d.ok ? { type: "ok", text: "配置已保存" } : { type: "err", text: d.error || "保存失败" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/wecom/notify-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth-token") || ""}` },
        body: JSON.stringify({ touser: testUser || cfg.test_touser || "@all" })
      });
      const d = await r.json();
      setMsg(d.ok ? { type: "ok", text: d.msg || "发送成功" } : { type: "err", text: d.error || "发送失败" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setTesting(false); }
  };

  const set = (key: string, val: any) => setCfg(prev => ({ ...prev, [key]: val }));

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-bold text-gray-800">企业微信通知平台</h2>
      </div>

      {/* 基础配置 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">基础配置</p>
        {[
          { key: "corpid", label: "企业 ID（corpid）", placeholder: "ww开头的企业ID" },
          { key: "corpsecret", label: "应用 Secret（corpsecret）", placeholder: "应用的 Secret" },
          { key: "agentid", label: "应用 AgentID", placeholder: "应用的 agentid，如 1000002" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs text-gray-500 mb-1 block">{label}</label>
            <input
              type="text"
              value={cfg[key] || ""}
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        ))}
        {/* 默认推送对象下拉框 */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">默认推送对象</label>
          <select
            value={cfg.test_touser || ""}
            onChange={e => set("test_touser", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">-- 选择成员 --</option>
            <option value="@all">@all（全员）</option>
            {loadingMembers ? (
              <option disabled>加载中...</option>
            ) : members.map(m => (
              <option key={m.userid} value={m.userid}>{m.name}（{m.userid}）</option>
            ))}
          </select>
        </div>
      </div>

      {/* 通知开关 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">通知开关</p>
        {notifyItems.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <button
              onClick={() => set(key, !cfg[key])}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg[key] ? "bg-blue-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg[key] ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        ))}
      </div>

      {/* 担保缺口阈值 */}
      {cfg.notify_collateral_gap && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="text-xs text-gray-500 mb-1 block">担保缺口预警阈值（U）</label>
          <input
            type="number"
            value={cfg.collateral_gap_threshold || ""}
            onChange={e => set("collateral_gap_threshold", e.target.value)}
            placeholder="如 500，缺口绝对值超过此值时推送"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      )}

      {/* 保存 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存配置"}
      </button>

      {/* 测试发送 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">测试发送</p>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">发送对象（留空则用默认推送对象）</label>
          <select
            value={testUser}
            onChange={e => setTestUser(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">-- 使用默认推送对象 --</option>
            {members.map(m => (
              <option key={m.userid} value={m.userid}>{m.name}（{m.userid}）</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
        >
          {testing ? "发送中..." : "发送测试消息"}
        </button>
      </div>

      {/* 结果提示 */}
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
