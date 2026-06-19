import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, RefreshCw, Trash2, Edit2, Plus, Check, X, Bot,
  Zap, MessageSquare, User, BarChart2, Menu, ChevronRight,
  Clock, Settings, AlertCircle, PlayCircle, StopCircle, Coins
} from "lucide-react";
import { toast } from "sonner";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface WecomSession {
  id: number;
  wecom_user_id: string;
  manus_task_id: string;
  nickname: string;
  model_pref?: string;
  system_prompt?: string;
  enabled?: number;
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
  task_id: string;
  nickname: string;
  wecom_user_id: string;
  total_cost: number;
  record_count: number;
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
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

// ─── Tab 按钮 ────────────────────────────────────────────────────────────────

type TabKey = "users" | "workflow" | "messages" | "stats" | "menu";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users", label: "用户", icon: <User className="w-4 h-4" /> },
  { key: "workflow", label: "工作流", icon: <Zap className="w-4 h-4" /> },
  { key: "messages", label: "消息", icon: <MessageSquare className="w-4 h-4" /> },
  { key: "stats", label: "统计", icon: <BarChart2 className="w-4 h-4" /> },
  { key: "menu", label: "菜单", icon: <Menu className="w-4 h-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════════

export default function WecomAdmin() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, { retry: 1 });

  // 权限检查：只有超级管理员可访问
  useEffect(() => {
    if (!isLoading && user && (user as any).role !== "super_admin") {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if ((user as any).role !== "super_admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => navigate("/admin")} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <Bot className="w-5 h-5 text-blue-600" />
        <h1 className="text-base font-semibold text-gray-900 flex-1">企微 AI 管理</h1>
      </div>

      {/* Tab 内容 */}
      <div className="pt-2">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "messages" && <MessagesTab />}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "menu" && <MenuTab />}
      </div>

      {/* 底部 Tab 栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 max-w-md mx-auto">
        <div className="flex">
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

function UsersTab() {
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<WecomSession>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ wecom_user_id: "", manus_task_id: "", nickname: "" });

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

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleDelete = async (id: number, nickname: string) => {
    if (!confirm(`确认删除「${nickname || id}」的绑定？删除后该用户下次发消息会重新创建任务。`)) return;
    try {
      const res = await fetch(`/api/wecom/sessions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) { toast.success("删除成功"); fetchSessions(); }
      else toast.error("删除失败：" + (data.error || "未知错误"));
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
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          手动绑定用户
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-blue-100">
          <div className="text-sm font-medium text-gray-700">手动绑定新用户</div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">企业微信用户ID *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="如：HuYongYu"
              value={addForm.wecom_user_id}
              onChange={e => setAddForm(f => ({ ...f, wecom_user_id: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Manus 任务ID *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="如：6iJ9mQRxzykTSqFHtz5KFp"
              value={addForm.manus_task_id}
              onChange={e => setAddForm(f => ({ ...f, manus_task_id: e.target.value }))}
            />
          </div>
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
            <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
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
                  <label className="text-xs text-gray-500 mb-1 block">Manus 任务ID</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                    value={editForm.manus_task_id || ""}
                    onChange={e => setEditForm(f => ({ ...f, manus_task_id: e.target.value }))}
                  />
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
                        {session.enabled === 0 && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">已禁用</span>
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
                    onClick={() => { setEditingId(session.id); setEditForm({ nickname: session.nickname, manus_task_id: session.manus_task_id, model_pref: session.model_pref || "manus-1.6-max", system_prompt: session.system_prompt || "" }); }}
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
                    onClick={() => handleDelete(session.id, session.nickname)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs border border-red-200"
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

function StatsTab() {
  const [stats, setStats] = useState<UsageStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wecom/stats");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats || []);
        setTotalCost(data.total_cost || 0);
      } else toast.error(data.error || "加载失败");
    } catch { toast.error("网络错误"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="px-4 space-y-3">
      {/* 总消耗卡片 */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-blue-200" />
          <span className="text-sm text-blue-100">企微渠道累计消耗</span>
        </div>
        <div className="text-3xl font-bold">{totalCost.toFixed(1)}</div>
        <div className="text-sm text-blue-200 mt-0.5">积分</div>
      </div>

      {/* 刷新按钮 */}
      <button
        onClick={fetchStats}
        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
        disabled={loading}
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        刷新数据
      </button>

      {/* 用户消耗列表 */}
      {loading && stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">暂无使用记录</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">用户</span>
            <div className="flex gap-6">
              <span className="text-xs font-medium text-gray-500">消息数</span>
              <span className="text-xs font-medium text-gray-500">消耗积分</span>
            </div>
          </div>
          {stats.map((stat, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between border-b border-gray-50 last:border-0">
              <div>
                <div className="text-sm font-medium text-gray-900">{stat.nickname || stat.wecom_user_id}</div>
                <div className="text-xs text-gray-400">{stat.wecom_user_id}</div>
              </div>
              <div className="flex gap-6 text-right">
                <div className="text-sm text-gray-600 w-10">{stat.record_count}</div>
                <div className="text-sm font-medium text-blue-600 w-14">{stat.total_cost.toFixed(1)}</div>
              </div>
            </div>
          ))}
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
      { name: "当前模型", type: "click", key: "MODEL_CURRENT" },
      { name: "预留", type: "click", key: "RESERVED_1_5" },
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
