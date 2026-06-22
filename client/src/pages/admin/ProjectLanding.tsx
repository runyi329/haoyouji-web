/**
 * ProjectLanding - 子项目落地页（路由 /p/:slug）
 *
 * 当前支持的项目：
 *   proj_69hzg9 → 营养俱乐部 AI 客服管理面板（channel_id=3）
 *   其他 slug   → 占位页
 *
 * 功能 Tab（与后台客服详情页完全一致）：
 *   - 配置（渠道状态、欢迎语、等待提示语、AI 指令、模型选择、消息抄送）
 *   - 专属规则（自定义触发规则）
 *   - 知识库（系统默认 + 私有，上传/添加/删除）
 *   - 用户（客户列表、拉黑管理）
 *   - 对话日志（分页查看）
 *
 * 设计：移动端优先，绿色健康配色，lucide-react 图标，严禁 Emoji。
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, BookOpen, MessageSquare, Loader2, Upload, Plus,
  Trash2, ChevronRight, ChevronDown, Save, RefreshCw, FileText, X,
  Users, Settings, Sparkles, ToggleLeft, ToggleRight, Check, User,
  Shield, ShieldOff,
} from "lucide-react";

// ─── 营养俱乐部配色 ──────────────────────────────────────────────
const C = {
  brand: "#27AE60",
  brandDeep: "#1A7A42",
  brandLight: "#E8F8EF",
  bg: "#F5FAF7",
  white: "#FFFFFF",
  textMain: "#1A2E22",
  textSub: "#6B8F78",
  line: "#D4EDE0",
} as const;

// ─── 客服渠道 ID（营养俱乐部绑定的渠道） ──────────────────────────
const KF_CHANNEL_ID = 3;
const KF_CHANNEL_TYPE = "kf";
const SYS_KB_CHANNEL_ID = 2; // 系统默认知识库

// ─── 工具函数 ────────────────────────────────────────────────────
function formatDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

// ─── 模型选项 ────────────────────────────────────────────────────
const AI_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek Flash（快速，省积分）" },
  { value: "deepseek-v4-pro", label: "DeepSeek Pro（强推理）" },
  { value: "manus-1.6-lite", label: "Manus 轻量" },
  { value: "manus-1.6", label: "Manus 标准" },
  { value: "manus-1.6-max", label: "Manus Max" },
];

const RULE_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek Pro" },
  { value: "manus-1.6-lite", label: "Manus 轻量" },
  { value: "manus-1.6", label: "Manus 标准" },
  { value: "manus-1.6-max", label: "Manus Max" },
];

// ─── 类型定义 ────────────────────────────────────────────────────
interface ChannelUser {
  wecom_user_id: string;
  nickname: string;
  avatar_url: string;
  msg_count: number;
  total_credits: number;
  last_active: string;
  blocked: boolean;
}

interface CustomRule {
  id: number;
  rule_name: string;
  trigger_intent: string;
  reply_mode: "template" | "ai";
  template_text: string;
  ai_model: string;
  ai_system_prompt: string;
  target_type: "all" | "selected";
  target_user_ids: string;
  enabled: boolean;
  trigger_count: number;
}

interface PromptRule {
  id: number;
  rule_text: string;
  enabled: boolean;
  sort_order: number;
  layer: number;
}

interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  item_count: number;
}

// ═══════════════════════════════════════════════════════════════
// 配置 Tab（完整版：渠道状态 + 欢迎语 + 等待提示 + AI 指令 + 模型 + 消息抄送）
// ═══════════════════════════════════════════════════════════════
function ConfigTab() {
  const [enabled, setEnabled] = useState(true);
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [contextRounds, setContextRounds] = useState(10);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyUserids, setNotifyUserids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  // 知识库
  const [kbId, setKbId] = useState(0);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);

  // 结构化 AI 指令
  const [promptRules, setPromptRules] = useState<PromptRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [showPromptExpand, setShowPromptExpand] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cfgRes, rulesRes, kbsRes, chCfgRes] = await Promise.all([
          fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`),
          fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID}`),
          fetch(`/api/wecom/knowledge-bases`),
          fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`),
        ]);
        const cfg = await cfgRes.json();
        const rulesData = await rulesRes.json();
        const kbs = await kbsRes.json();
        const chCfg = await chCfgRes.json();
        if (cfg.config) {
          const c = cfg.config;
          setEnabled(c.enabled !== false);
          setWelcomeMsg(c.welcome_msg || "");
          setWaitingMsg(c.waiting_msg || "");
          setSystemPrompt(c.system_prompt || "");
          setAiModel(c.ai_model || "deepseek-chat");
          setContextRounds(c.context_rounds || 10);
          setNotifyEnabled(!!c.notify_enabled);
          setNotifyUserids(c.notify_userids ? (Array.isArray(c.notify_userids) ? c.notify_userids : c.notify_userids.split(",").filter(Boolean)) : []);
          const snap = JSON.stringify({ wm: c.welcome_msg || "", wt: c.waiting_msg || "", sp: c.system_prompt || "", am: c.ai_model || "deepseek-chat", cr: c.context_rounds || 10, ne: !!c.notify_enabled, nu: c.notify_userids || "", ki: 0 });
          setSavedSnapshot(snap);
        }
        if (Array.isArray(kbs)) setKbList(kbs);
        if (chCfg && !chCfg.error) {
          const ki = chCfg.knowledge_base_id || 0;
          setKbId(ki);
        }
        if (rulesData.ok) setPromptRules(rulesData.rules || []);
      } catch {
        toast.error("加载配置失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      // 保存渠道配置（含知识库绑定）
      const r = await fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`, {
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
      const d = await r.json();
      if (d.ok) {
        toast.success("保存成功");
        setJustSaved(true);
        const snap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, sp: systemPrompt, am: aiModel, cr: contextRounds, ne: notifyEnabled, nu: notifyUserids.join(","), ki: kbId });
        setSavedSnapshot(snap);
        setTimeout(() => setJustSaved(false), 2000);
      } else toast.error(d.error || "保存失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled() {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { enabled: newVal } }),
      });
      toast.success(newVal ? "渠道已启用" : "渠道已停用");
    } catch {
      toast.error("操作失败");
      setEnabled(!newVal);
    }
  }

  async function handleSaveRule(rule: PromptRule) {
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/prompt-rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_text: editingRuleText }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("已保存"); setEditingRuleId(null); setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_text: editingRuleText } : r)); }
      else toast.error(d.error || "保存失败");
    } catch { toast.error("保存失败"); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(rule: PromptRule) {
    try {
      const res = await fetch(`/api/wecom/prompt-rules/${rule.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      const d = await res.json();
      if (d.ok) setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  }

  async function handleAddRule() {
    if (!newRuleText.trim()) { toast.error("请输入指令内容"); return; }
    setSavingRule(true);
    try {
      const res = await fetch("/api/wecom/prompt-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: KF_CHANNEL_ID, channel_type: KF_CHANNEL_TYPE, rule_text: newRuleText, layer: 2 }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("添加成功");
        setAddingRule(false);
        setNewRuleText("");
        const rulesRes = await fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID}`);
        const rulesData = await rulesRes.json();
        if (rulesData.ok) setPromptRules(rulesData.rules || []);
      } else toast.error(d.error || "添加失败");
    } catch { toast.error("添加失败"); }
    finally { setSavingRule(false); }
  }

  async function handleDeleteRule(id: number) {
    try {
      const res = await fetch(`/api/wecom/prompt-rules/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success("已删除"); setPromptRules(prev => prev.filter(r => r.id !== id)); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  const currentSnap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, sp: systemPrompt, am: aiModel, cr: contextRounds, ne: notifyEnabled, nu: notifyUserids.join(","), ki: kbId });
  const isDirty = savedSnapshot === "" || currentSnap !== savedSnapshot;

  const layer1Rules = promptRules.filter(r => r.layer === 1);
  const layer2Rules = promptRules.filter(r => r.layer === 2);
  const enabledCount = promptRules.filter(r => r.enabled).length;

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>;
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 渠道状态 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: C.textMain }}>渠道状态</div>
            <div className="text-xs mt-0.5" style={{ color: C.textSub }}>
              {enabled ? "已启用，AI 正在接收消息" : "已停用，AI 不接收消息"}
            </div>
          </div>
          <button onClick={handleToggleEnabled}>
            {enabled
              ? <ToggleRight className="w-9 h-9" style={{ color: C.brand }} />
              : <ToggleLeft className="w-9 h-9 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* 欢迎语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: C.textMain }}>欢迎语</div>
          <span className="text-xs" style={{ color: C.textSub }}>用户首次发消息时自动回复，留空则不发送</span>
        </div>
        <textarea
          value={welcomeMsg}
          onChange={(e) => setWelcomeMsg(e.target.value)}
          rows={3}
          className="w-full text-sm rounded-xl border p-3 resize-none outline-none focus:ring-2"
          style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
          placeholder="未设置欢迎语"
        />
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: C.textMain }}>等待提示语</div>
          <span className="text-xs" style={{ color: C.textSub }}>用户发消息后、AI 回复前显示的提示</span>
        </div>
        <input
          value={waitingMsg}
          onChange={(e) => setWaitingMsg(e.target.value)}
          className="w-full text-sm rounded-xl border p-3 outline-none focus:ring-2"
          style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
          placeholder="如：收到，AI 正在思考中，请稍候..."
        />
      </div>

      {/* AI 指令管理（结构化） */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: C.line }}>
        <button
          className="w-full px-4 py-3 flex items-center justify-between"
          onClick={() => setShowPromptExpand(!showPromptExpand)}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" style={{ color: C.brand }} />
            <span className="text-sm font-semibold" style={{ color: C.textMain }}>AI 指令管理</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.brandLight, color: C.brand }}>
              第1层 {layer1Rules.length} 条 · 第2层 {layer2Rules.length}/{layer2Rules.length} 条启用
            </span>
          </div>
          {showPromptExpand
            ? <ChevronDown className="w-4 h-4" style={{ color: C.textSub }} />
            : <ChevronRight className="w-4 h-4" style={{ color: C.textSub }} />}
        </button>

        {showPromptExpand && (
          <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: C.line }}>
            {/* 第1层（系统级，只读） */}
            {layer1Rules.length > 0 && (
              <div>
                <div className="text-xs font-medium mt-3 mb-2" style={{ color: C.textSub }}>第1层（系统级，只读）</div>
                {layer1Rules.map(rule => (
                  <div key={rule.id} className="rounded-xl border p-3 mb-2" style={{ borderColor: C.line, backgroundColor: C.bg }}>
                    <div className="text-xs" style={{ color: C.textMain }}>{rule.rule_text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 第2层（自定义） */}
            <div>
              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="text-xs font-medium" style={{ color: C.textSub }}>第2层（自定义指令）</div>
                <button
                  onClick={() => setAddingRule(true)}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg"
                  style={{ backgroundColor: C.brandLight, color: C.brand }}
                >
                  <Plus className="w-3 h-3" />添加
                </button>
              </div>
              {layer2Rules.length === 0 && !addingRule && (
                <div className="text-xs text-center py-4" style={{ color: C.textSub }}>暂无自定义指令</div>
              )}
              {layer2Rules.map(rule => (
                <div key={rule.id} className={`rounded-xl border p-3 mb-2 ${!rule.enabled ? "opacity-50" : ""}`} style={{ borderColor: C.line }}>
                  {editingRuleId === rule.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingRuleText}
                        onChange={e => setEditingRuleText(e.target.value)}
                        rows={3}
                        className="w-full text-xs rounded-lg border p-2 resize-none outline-none"
                        style={{ borderColor: C.line }}
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSaveRule(rule)}
                          disabled={savingRule}
                          className="flex-1 py-1.5 rounded-lg text-xs text-white flex items-center justify-center gap-1"
                          style={{ backgroundColor: C.brand }}
                        >
                          {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}保存
                        </button>
                        <button
                          onClick={() => setEditingRuleId(null)}
                          className="flex-1 py-1.5 rounded-lg text-xs border"
                          style={{ borderColor: C.line, color: C.textSub }}
                        >取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 text-xs" style={{ color: C.textMain }}>{rule.rule_text}</div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingRuleId(rule.id); setEditingRuleText(rule.rule_text); }}
                          className="text-xs px-1.5 py-0.5 rounded border"
                          style={{ borderColor: C.line, color: C.textSub }}
                        >编辑</button>
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className="text-xs px-1.5 py-0.5 rounded border"
                          style={{ borderColor: rule.enabled ? C.line : C.brand, color: rule.enabled ? C.textSub : C.brand }}
                        >{rule.enabled ? "停用" : "启用"}</button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs px-1.5 py-0.5 rounded border border-red-100 text-red-400"
                        >删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {addingRule && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: C.brand }}>
                  <textarea
                    value={newRuleText}
                    onChange={e => setNewRuleText(e.target.value)}
                    rows={3}
                    className="w-full text-xs rounded-lg border p-2 resize-none outline-none"
                    style={{ borderColor: C.line }}
                    placeholder="输入新的 AI 指令..."
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleAddRule}
                      disabled={savingRule}
                      className="flex-1 py-1.5 rounded-lg text-xs text-white flex items-center justify-center gap-1"
                      style={{ backgroundColor: C.brand }}
                    >
                      {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}添加
                    </button>
                    <button
                      onClick={() => { setAddingRule(false); setNewRuleText(""); }}
                      className="flex-1 py-1.5 rounded-lg text-xs border"
                      style={{ borderColor: C.line, color: C.textSub }}
                    >取消</button>
                  </div>
                </div>
              )}
            </div>

            {/* System Prompt 文本框（备用） */}
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: C.textSub }}>系统指令（文本模式）</div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="w-full text-sm rounded-xl border p-3 resize-none outline-none"
                style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
                placeholder="直接输入 AI 系统指令..."
              />
              <div className="text-xs mt-1" style={{ color: C.textSub }}>{systemPrompt.length} 字符</div>
            </div>
          </div>
        )}
      </div>

      {/* 默认 AI 模型 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="text-sm font-semibold mb-3" style={{ color: C.textMain }}>默认 AI 模型</div>
        <div className="space-y-2">
          {AI_MODELS.map(m => (
            <button
              key={m.value}
              onClick={() => setAiModel(m.value)}
              className="w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-all"
              style={aiModel === m.value
                ? { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep }
                : { borderColor: C.line, color: C.textMain }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 会话上下文轮数 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold" style={{ color: C.textMain }}>会话上下文轮数</div>
          <span className="text-sm font-bold" style={{ color: C.brand }}>{contextRounds} 轮</span>
        </div>
        <p className="text-xs mb-3" style={{ color: C.textSub }}>AI 记忆多少轮对话历史，数值越大越消耗积分（建议 5-20）</p>
        <input
          type="range" min={1} max={50} value={contextRounds}
          onChange={e => setContextRounds(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: C.brand }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: C.line }}>
          <span>1轮（省积分）</span><span>50轮（强记忆）</span>
        </div>
      </div>

      {/* 消息抄送 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold" style={{ color: C.textMain }}>消息抄送通知</div>
            <div className="text-xs mt-0.5" style={{ color: C.textSub }}>AI 回复客户后，同步抄送给指定成员</div>
          </div>
          <button onClick={() => setNotifyEnabled(v => !v)}>
            {notifyEnabled
              ? <ToggleRight className="w-9 h-9" style={{ color: C.brand }} />
              : <ToggleLeft className="w-9 h-9 text-gray-400" />}
          </button>
        </div>
        {notifyEnabled && (
          <div className="space-y-2 mt-2">
            <div className="text-xs" style={{ color: C.textSub }}>输入接收人 userid（多个用英文逗号分隔）</div>
            <input
              value={notifyUserids.join(",")}
              onChange={e => setNotifyUserids(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="如：HuXX,ZhangXX"
              className="w-full text-sm rounded-xl border p-3 outline-none"
              style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
            />
            {notifyUserids.length > 0 && (
              <div className="text-xs px-3 py-2 rounded-xl" style={{ backgroundColor: C.brandLight, color: C.brand }}>
                已选 {notifyUserids.length} 人：{notifyUserids.join("、")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 绑定知识库 */}
      {kbList.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
          <div className="text-sm font-semibold mb-3" style={{ color: C.textMain }}>绑定知识库</div>
          <div className="space-y-2">
            <button
              onClick={() => setKbId(0)}
              className="w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-all"
              style={kbId === 0
                ? { borderColor: C.textSub, backgroundColor: C.bg, color: C.textSub }
                : { borderColor: C.line, color: C.textSub }}
            >
              不绑定知识库
            </button>
            {kbList.map(kb => (
              <button
                key={kb.id}
                onClick={() => setKbId(kb.id)}
                className="w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-all"
                style={kbId === kb.id
                  ? { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep }
                  : { borderColor: C.line, color: C.textMain }}
              >
                <div className="font-medium">{kb.name}</div>
                {kb.description && <div className="text-xs mt-0.5" style={{ color: C.textSub }}>{kb.description}</div>}
                <div className="text-xs mt-0.5" style={{ color: C.textSub }}>{kb.item_count} 条记录</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving || justSaved || !isDirty}
        className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
        style={{ backgroundColor: justSaved ? "#16A34A" : isDirty ? C.brand : "#9CA3AF" }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : justSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? "保存中..." : justSaved ? "已保存" : isDirty ? "保存配置" : "配置未更改"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 专属规则 Tab
// ═══════════════════════════════════════════════════════════════
function RulesTab() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [users, setUsers] = useState<ChannelUser[]>([]);
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
      const res = await fetch(`/api/wecom/custom-rules?channel_type=${KF_CHANNEL_TYPE}`);
      const d = await res.json();
      if (d.ok) setRules(d.rules || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`/api/wecom/ch/users?channel_type=${KF_CHANNEL_TYPE}`);
      const d = await res.json();
      if (d.ok) setUsers(d.users || []);
    } catch {}
  };

  useEffect(() => { loadRules(); loadUsers(); }, []);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ rule_name: "", trigger_intent: "", reply_mode: "ai", template_text: "", ai_model: "deepseek-chat", ai_system_prompt: "", target_type: "selected", selected_user_ids: [] });
    setShowModal(true);
  };

  const openEdit = (rule: CustomRule) => {
    setEditingRule(rule);
    let ids: string[] = [];
    try { ids = JSON.parse(rule.target_user_ids || "[]"); } catch {}
    setForm({ rule_name: rule.rule_name, trigger_intent: rule.trigger_intent, reply_mode: rule.reply_mode, template_text: rule.template_text || "", ai_model: rule.ai_model || "deepseek-chat", ai_system_prompt: rule.ai_system_prompt || "", target_type: rule.target_type, selected_user_ids: ids });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.rule_name.trim()) { toast.error("请输入规则名称"); return; }
    if (!form.trigger_intent.trim()) { toast.error("请输入触发意图描述"); return; }
    setSaving(true);
    try {
      const body = { ...form, target_user_ids: form.target_type === "all" ? [] : form.selected_user_ids, channel_type: KF_CHANNEL_TYPE, enabled: 1 };
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

  const filteredRules = rules.filter(r => r.rule_name.includes(search) || r.trigger_intent.includes(search));
  const enabledCount = rules.filter(r => r.enabled).length;
  const totalTriggers = rules.reduce((s, r) => s + (r.trigger_count || 0), 0);

  return (
    <div className="space-y-3 pb-6">
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2">
        {[{ label: "规则总数", value: rules.length, color: C.textMain }, { label: "已启用", value: enabledCount, color: C.brand }, { label: "累计命中", value: totalTriggers, color: "#2980B9" }].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3 text-center border shadow-sm" style={{ borderColor: C.line }}>
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: C.textSub }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 搜索和新建 */}
      <div className="flex gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索规则名称或意图..."
          className="flex-1 text-sm border rounded-xl px-3 py-2 outline-none"
          style={{ borderColor: C.line }}
        />
        <button onClick={openCreate} className="flex items-center gap-1 text-white text-sm px-3 py-2 rounded-xl" style={{ backgroundColor: C.brand }}>
          <Plus className="w-4 h-4" />新建
        </button>
      </div>

      {/* 规则列表 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: C.brand }} /></div>
      ) : filteredRules.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="w-10 h-10 mx-auto mb-2" style={{ color: C.line }} />
          <div className="text-sm" style={{ color: C.textSub }}>暂无专属规则</div>
          <div className="text-xs mt-1" style={{ color: C.textSub }}>点击「新建」添加第一条规则</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRules.map(rule => {
            let userIds: string[] = [];
            try { userIds = JSON.parse(rule.target_user_ids || "[]"); } catch {}
            const targetUsers = users.filter(u => userIds.includes(u.wecom_user_id));
            return (
              <div key={rule.id} className={`bg-white rounded-2xl border p-3 shadow-sm ${!rule.enabled ? "opacity-60" : ""}`} style={{ borderColor: C.line }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rule.enabled ? C.brand : "#9CA3AF" }} />
                      <span className="text-sm font-medium truncate" style={{ color: C.textMain }}>{rule.rule_name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={rule.reply_mode === "template" ? { backgroundColor: "#FFF7ED", color: "#EA580C" } : { backgroundColor: C.brandLight, color: C.brand }}>
                        {rule.reply_mode === "template" ? "固定模板" : "AI回复"}
                      </span>
                    </div>
                    <div className="text-xs mt-1 line-clamp-2" style={{ color: C.textSub }}>{rule.trigger_intent}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {rule.target_type === "all" ? (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F5F3FF", color: "#7C3AED" }}>全部用户</span>
                      ) : (
                        <span className="text-xs" style={{ color: C.textSub }}>
                          {targetUsers.length > 0 ? targetUsers.slice(0, 3).map(u => u.nickname).join("、") + (targetUsers.length > 3 ? `等${targetUsers.length}人` : "") : `${userIds.length}个用户`}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: C.line }}>·</span>
                      <span className="text-xs" style={{ color: C.textSub }}>命中 {rule.trigger_count} 次</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(rule)} className="text-xs border rounded-lg px-2 py-1" style={{ borderColor: "#BFDBFE", color: "#2563EB" }}>编辑</button>
                    <button onClick={() => handleToggle(rule)} className="text-xs border rounded-lg px-2 py-1" style={rule.enabled ? { borderColor: C.line, color: C.textSub } : { borderColor: C.brand, color: C.brand }}>
                      {rule.enabled ? "停用" : "启用"}
                    </button>
                    {deleteConfirm === rule.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(rule.id)} className="text-xs text-white bg-red-500 rounded-lg px-1.5 py-1">确删</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs border rounded-lg px-1.5 py-1" style={{ borderColor: C.line, color: C.textSub }}>取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(rule.id)} className="text-xs border border-red-100 text-red-400 rounded-lg px-2 py-1">删除</button>
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: C.line }}>
              <span className="font-semibold" style={{ color: C.textMain }}>{editingRule ? "编辑规则" : "新建专属规则"}</span>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>规则名称 <span className="text-red-400">*</span></label>
                <input value={form.rule_name} onChange={e => setForm(p => ({ ...p, rule_name: e.target.value }))} placeholder="如：产品价格查询" className="w-full text-sm border rounded-xl px-3 py-2 outline-none" style={{ borderColor: C.line }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>触发意图描述 <span className="text-red-400">*</span></label>
                <div className="text-xs mb-1" style={{ color: C.textSub }}>用自然语言描述什么情况下触发，AI 会判断用户消息是否匹配</div>
                <textarea value={form.trigger_intent} onChange={e => setForm(p => ({ ...p, trigger_intent: e.target.value }))} placeholder="如：用户在询问某产品的价格或购买方式" className="w-full text-sm border rounded-xl px-3 py-2 resize-none outline-none min-h-[70px]" style={{ borderColor: C.line }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: C.textSub }}>回复模式</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: "template", l: "固定模板回复" }, { v: "ai", l: "专属 AI 回复" }].map(m => (
                    <button key={m.v} onClick={() => setForm(p => ({ ...p, reply_mode: m.v as any }))} className="py-2.5 rounded-xl text-sm font-medium border-2 transition-all" style={form.reply_mode === m.v ? (m.v === "template" ? { borderColor: "#EA580C", backgroundColor: "#FFF7ED", color: "#EA580C" } : { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep }) : { borderColor: C.line, color: C.textSub }}>
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>
              {form.reply_mode === "template" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>回复内容</label>
                  <textarea value={form.template_text} onChange={e => setForm(p => ({ ...p, template_text: e.target.value }))} placeholder="输入固定回复内容" className="w-full text-sm border rounded-xl px-3 py-2 resize-none outline-none min-h-[100px] font-mono" style={{ borderColor: C.line }} />
                </div>
              )}
              {form.reply_mode === "ai" && (
                <>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>指定模型</label>
                    <div className="space-y-1.5">
                      {RULE_MODELS.map(m => (
                        <button key={m.value} onClick={() => setForm(p => ({ ...p, ai_model: m.value }))} className="w-full text-left text-sm px-3 py-2 rounded-xl border-2 transition-all" style={form.ai_model === m.value ? { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep } : { borderColor: C.line, color: C.textMain }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>专属 System Prompt</label>
                    <textarea value={form.ai_system_prompt} onChange={e => setForm(p => ({ ...p, ai_system_prompt: e.target.value }))} placeholder="告诉 AI 用什么格式、查什么内容回答" className="w-full text-sm border rounded-xl px-3 py-2 resize-none outline-none min-h-[120px]" style={{ borderColor: C.line }} />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: C.textSub }}>适用用户</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[{ v: "selected", l: "指定用户" }, { v: "all", l: "全部用户" }].map(t => (
                    <button key={t.v} onClick={() => setForm(p => ({ ...p, target_type: t.v as any }))} className="py-2 rounded-xl text-sm font-medium border-2 transition-all" style={form.target_type === t.v ? (t.v === "all" ? { borderColor: "#7C3AED", backgroundColor: "#F5F3FF", color: "#7C3AED" } : { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep }) : { borderColor: C.line, color: C.textSub }}>
                      {t.l}
                    </button>
                  ))}
                </div>
                {form.target_type === "selected" && (
                  <div className="relative">
                    <button type="button" onClick={() => { setUserDropdownOpen(v => !v); setUserSearch(""); }} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border-2 transition-all" style={form.selected_user_ids.length > 0 ? { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep } : { borderColor: C.line, color: C.textSub }}>
                      <span>{form.selected_user_ids.length === 0 ? "点击选择用户..." : `已选 ${form.selected_user_ids.length} 个用户`}</span>
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    </button>
                    {userDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-2xl shadow-lg" style={{ borderColor: C.line }}>
                        <div className="px-3 pt-2.5 pb-1.5">
                          <input type="text" placeholder="搜索用户名..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="w-full text-sm border rounded-xl px-2.5 py-1.5 outline-none" style={{ borderColor: C.line }} />
                        </div>
                        <div className="max-h-52 overflow-y-auto py-1">
                          {users.filter(u => !userSearch || (u.nickname || u.wecom_user_id).toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                            <label key={u.wecom_user_id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={form.selected_user_ids.includes(u.wecom_user_id)} onChange={() => setForm(p => ({ ...p, selected_user_ids: p.selected_user_ids.includes(u.wecom_user_id) ? p.selected_user_ids.filter(id => id !== u.wecom_user_id) : [...p.selected_user_ids, u.wecom_user_id] }))} className="w-4 h-4 flex-shrink-0" style={{ accentColor: C.brand }} />
                              {u.avatar_url ? <img src={u.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" alt="" /> : <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><User className="w-3.5 h-3.5 text-gray-400" /></div>}
                              <span className="text-sm truncate" style={{ color: C.textMain }}>{u.nickname || u.wecom_user_id}</span>
                            </label>
                          ))}
                        </div>
                        <div className="border-t px-3 py-2 flex items-center justify-between" style={{ borderColor: C.line }}>
                          <span className="text-xs" style={{ color: C.textSub }}>已选 {form.selected_user_ids.length} 个</span>
                          <button type="button" onClick={() => setUserDropdownOpen(false)} className="text-xs font-medium" style={{ color: C.brand }}>确定</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: C.brand }}>
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

// ═══════════════════════════════════════════════════════════════
// 知识库 Tab
// ═══════════════════════════════════════════════════════════════
function KnowledgeTab() {
  const [stats, setStats] = useState({ kb_count: 0, item_count: 0, file_count: 0, char_count: 0, last_updated: null as string | null, month_count: 0 });
  const [sysStats, setSysStats] = useState({ kb_count: 0, item_count: 0, file_count: 0, char_count: 0, month_count: 0 });
  const [sysKbEnabled, setSysKbEnabled] = useState(true);
  const [togglingKb, setTogglingKb] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [addQuestion, setAddQuestion] = useState("");
  const [addAnswer, setAddAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewSource, setViewSource] = useState<string | null>(null);
  const [sourceItems, setSourceItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [s, src, sys] = await Promise.all([
        fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/sources?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()),
      ]);
      const chCfg = await fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`).then(r => r.json()).catch(() => ({}));
      if (s.ok) setStats({ kb_count: s.kb_count || 0, item_count: s.item_count || 0, file_count: s.file_count || 0, char_count: s.char_count || 0, last_updated: s.last_updated || null, month_count: s.month_count || 0 });
      if (src.ok) setSources(src.sources || []);
      if (sys.ok) setSysStats({ kb_count: sys.kb_count || 0, item_count: sys.item_count || 0, file_count: sys.file_count || 0, char_count: sys.char_count || 0, month_count: sys.month_count || 0 });
      setSysKbEnabled(chCfg.disable_system_kb !== '1');
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleToggleSysKb() {
    setTogglingKb(true);
    try {
      const newVal = !sysKbEnabled;
      const res = await fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disable_system_kb: newVal ? '0' : '1' }),
      });
      const d = await res.json();
      if (d.ok) { setSysKbEnabled(newVal); toast.success(newVal ? '共享知识库已启用' : '共享知识库已禁用'); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setTogglingKb(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("channel_type", KF_CHANNEL_TYPE);
      fd.append("channel_id", String(KF_CHANNEL_ID));
      const res = await fetch("/api/wecom/ch/kb/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) { toast.success(`导入成功，新增 ${d.imported} 条`); loadData(); }
      else toast.error(d.error || "导入失败");
    } catch { toast.error("上传失败"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleAdd() {
    if (!addAnswer.trim()) { toast.error("请输入答案内容"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/wecom/ch/kb/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_type: KF_CHANNEL_TYPE, channel_id: KF_CHANNEL_ID, question: addQuestion || null, answer: addAnswer }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("添加成功"); setShowAddModal(false); setAddQuestion(""); setAddAnswer(""); loadData(); }
      else toast.error(d.error || "添加失败");
    } catch { toast.error("网络错误"); }
    finally { setSaving(false); }
  }

  async function handleDelete(sourceFile: string) {
    try {
      const res = await fetch(`/api/wecom/ch/kb/source?channel_id=${KF_CHANNEL_ID}&source_file=${encodeURIComponent(sourceFile)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteConfirm(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function loadSourceItems(sourceFile: string) {
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/items?channel_id=${KF_CHANNEL_ID}&source_file=${encodeURIComponent(sourceFile)}&limit=50`);
      const d = await res.json();
      if (d.ok) setSourceItems(d.items || []);
    } catch {}
    finally { setLoadingItems(false); }
  }

  function fmtChars(n: number) {
    return n.toLocaleString("zh-CN");
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>;

  return (
    <div className="space-y-4 pb-6">
      {/* 共享知识库容器 */}
      {(() => {
        const now = new Date();
        const bjNow = new Date(now.getTime() + 8 * 3600 * 1000);
        const dateStr = `${bjNow.getUTCFullYear()}年${bjNow.getUTCMonth() + 1}月${bjNow.getUTCDate()}日`;
        return (
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: C.white, borderColor: C.line, opacity: sysKbEnabled ? 1 : 0.7 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: C.textMain }}>共享知识库</span>
              <div
                onClick={togglingKb ? undefined : handleToggleSysKb}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: sysKbEnabled ? C.brand : '#D1D5DB',
                  cursor: togglingKb ? 'not-allowed' : 'pointer',
                  opacity: togglingKb ? 0.5 : 1,
                  flexShrink: 0,
                  transition: 'background-color 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: sysKbEnabled ? 19 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transition: 'left 0.2s',
                }} />
              </div>
            </div>
            <div className="flex items-baseline gap-4 mb-2">
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{sysStats.kb_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>知识库</span></span>
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{sysStats.item_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>条目</span></span>
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{sysStats.file_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>文件</span></span>
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{fmtChars(sysStats.char_count)}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>字符</span></span>
            </div>
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <span className="text-xs" style={{ color: C.textSub }}>更新至 <span className="font-medium" style={{ color: C.textMain }}>{dateStr}</span></span>
              <span className="text-xs" style={{ color: C.textSub }}>本月新增 <span className="font-semibold" style={{ color: C.brand }}>{sysStats.month_count}</span> 条</span>
            </div>
          </div>
        );
      })()}

      {/* 私人知识库容器（统计 + 操作 + 文件列表全部包在一起） */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line }}>
        {/* 标题 + 统计数字 */}
        <div className="px-4 py-3 border-b" style={{ backgroundColor: C.white, borderColor: C.line }}>
          <div className="text-xs font-semibold mb-2" style={{ color: C.textMain }}>私人知识库</div>
          <div className="flex items-baseline gap-4 mb-2">
            <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{stats.kb_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>知识库</span></span>
            <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{stats.item_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>条目</span></span>
            <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{stats.file_count}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>文件</span></span>
            <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{fmtChars(stats.char_count)}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>字符</span></span>
          </div>
          {(() => {
            const now = new Date();
            const bjNow = new Date(now.getTime() + 8 * 3600 * 1000);
            const dateStr = `${bjNow.getUTCFullYear()}年${bjNow.getUTCMonth() + 1}月${bjNow.getUTCDate()}日`;
            return (
              <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <span className="text-xs" style={{ color: C.textSub }}>更新至 <span className="font-medium" style={{ color: C.textMain }}>{dateStr}</span></span>
                <span className="text-xs" style={{ color: C.textSub }}>本月新增 <span className="font-semibold" style={{ color: C.brand }}>{stats.month_count}</span> 条</span>
              </div>
            );
          })()}
        </div>
        {/* 操作按钮 */}
        <div className="px-4 py-3 border-b relative" style={{ backgroundColor: C.white, borderColor: C.line }}>
          <button
            onClick={() => setShowUploadMenu(v => !v)}
            disabled={uploading}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 text-white active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ backgroundColor: C.brand }}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {uploading ? "上传中..." : "添加"}
          </button>
          {showUploadMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUploadMenu(false)} />
              <div
                className="absolute left-4 right-4 rounded-xl border shadow-lg z-20 overflow-hidden"
                style={{ top: 'calc(100% - 4px)', backgroundColor: C.white, borderColor: C.line }}
              >
                <button
                  onClick={() => { setShowUploadMenu(false); if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.setAttribute('capture', 'environment'); } fileInputRef.current?.click(); }}
                  className="w-full px-4 py-3 text-sm text-left flex items-center gap-3 border-b active:bg-gray-50"
                  style={{ borderColor: C.line, color: C.textMain }}
                >
                  <span style={{ fontSize: 18 }}>📷</span> 拍照上传
                </button>
                <button
                  onClick={() => { setShowUploadMenu(false); setShowAddModal(true); }}
                  className="w-full px-4 py-3 text-sm text-left flex items-center gap-3 border-b active:bg-gray-50"
                  style={{ borderColor: C.line, color: C.textMain }}
                >
                  <span style={{ fontSize: 18 }}>✍️</span> 手写输入
                </button>
                <button
                  onClick={() => { setShowUploadMenu(false); if (fileInputRef.current) { fileInputRef.current.accept = '.xlsx,.csv,.pdf,.docx,.txt'; fileInputRef.current.removeAttribute('capture'); } fileInputRef.current?.click(); }}
                  className="w-full px-4 py-3 text-sm text-left flex items-center gap-3 active:bg-gray-50"
                  style={{ color: C.textMain }}
                >
                  <span style={{ fontSize: 18 }}>📂</span> 文件上传
                </button>
              </div>
            </>
          )}
          <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.csv,.pdf,.docx,.txt" onChange={handleUpload} />
        </div>
        {/* 来源文件列表 */}
        <div style={{ backgroundColor: C.white }}>
          <div className="px-4 py-3 border-b text-xs font-semibold" style={{ borderColor: C.line, color: C.textSub }}>来源文件 ({sources.length})</div>
          {sources.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: C.textSub }}>暂无知识库内容，请上传文件或手动添加</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: C.line }}>
              {sources.map((s: any) => (
                <li key={s.source_file}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: C.brand }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: C.textMain }}>{s.source_file}</div>
                      <div className="text-xs" style={{ color: C.textSub }}>{s.item_count} 条 · {formatDate(s.latest_time)}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { if (viewSource === s.source_file) { setViewSource(null); } else { setViewSource(s.source_file); loadSourceItems(s.source_file); } }}
                        className="text-xs border rounded-lg px-2 py-1"
                        style={{ borderColor: C.line, color: C.textSub }}
                      >
                        {viewSource === s.source_file ? "收起" : "查看"}
                      </button>
                      {deleteConfirm === s.source_file ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(s.source_file)} className="text-xs text-white bg-red-500 rounded-lg px-2 py-1">确删</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-xs border rounded-lg px-2 py-1" style={{ borderColor: C.line, color: C.textSub }}>取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(s.source_file)} className="p-1.5 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                  {viewSource === s.source_file && (
                    <div className="px-4 pb-3 border-t" style={{ borderColor: C.line }}>
                      {loadingItems ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: C.brand }} /></div>
                      ) : (
                        <div className="space-y-2 mt-2">
                          {sourceItems.map((item: any) => (
                            <div key={item.id} className="rounded-xl p-2.5 text-xs" style={{ backgroundColor: C.bg }}>
                              {item.question && <div className="font-medium mb-1" style={{ color: C.textMain }}>Q: {item.question}</div>}
                              <div style={{ color: C.textSub }}>A: {item.answer}</div>
                            </div>
                          ))}
                          {sourceItems.length === 0 && <div className="text-xs text-center py-2" style={{ color: C.textSub }}>暂无条目</div>}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 手动添加弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: C.textMain }}>手动添加知识条目</span>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>问题（可选）</label>
              <input value={addQuestion} onChange={e => setAddQuestion(e.target.value)} className="w-full text-sm rounded-xl border p-3 outline-none" style={{ borderColor: C.line }} placeholder="如：产品价格是多少" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>答案内容（必填）</label>
              <textarea value={addAnswer} onChange={e => setAddAnswer(e.target.value)} rows={5} className="w-full text-sm rounded-xl border p-3 resize-none outline-none" style={{ borderColor: C.line }} placeholder="请输入知识内容..." />
            </div>
            <button onClick={handleAdd} disabled={saving} className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: C.brand }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "添加中..." : "确认添加"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 用户 Tab
// ═══════════════════════════════════════════════════════════════
function UsersTab() {
  const [users, setUsers] = useState<ChannelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockConfirm, setBlockConfirm] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/wecom/ch/users?channel_type=${KF_CHANNEL_TYPE}`);
      const d = await res.json();
      if (d.ok) setUsers(d.users || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleBlock(userId: string, blocked: boolean) {
    try {
      const action = blocked ? "unblock" : "block";
      const res = await fetch(`/api/wecom/ch/users/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wecom_user_id: userId, channel_type: KF_CHANNEL_TYPE }),
      });
      const d = await res.json();
      if (d.ok) { toast.success(blocked ? "已解除拉黑" : "已拉黑"); setBlockConfirm(null); loadUsers(); }
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  }

  const activeUsers = users.filter(u => !u.blocked);
  const blockedUsers = users.filter(u => u.blocked);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>;

  return (
    <div className="space-y-4 pb-6">
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2">
        {[{ label: "总用户", value: users.length, color: C.textMain }, { label: "活跃", value: activeUsers.length, color: C.brand }, { label: "已拉黑", value: blockedUsers.length, color: "#EF4444" }].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3 text-center border shadow-sm" style={{ borderColor: C.line }}>
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: C.textSub }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 用户列表 */}
      {users.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 mx-auto mb-2" style={{ color: C.line }} />
          <div className="text-sm" style={{ color: C.textSub }}>暂无用户记录</div>
          <div className="text-xs mt-1" style={{ color: C.textSub }}>有用户发消息后会自动出现在这里</div>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => (
            <div key={user.wecom_user_id} className={`bg-white rounded-2xl border p-3 shadow-sm flex items-center gap-3 ${user.blocked ? "opacity-60" : ""}`} style={{ borderColor: C.line }}>
              {user.avatar_url ? (
                <img src={user.avatar_url} className="w-10 h-10 rounded-full flex-shrink-0" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.brandLight }}>
                  <User className="w-5 h-5" style={{ color: C.brand }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: C.textMain }}>{user.nickname || user.wecom_user_id}</span>
                  {user.blocked && <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500">已拉黑</span>}
                </div>
                <div className="text-xs mt-0.5" style={{ color: C.textSub }}>
                  消息 {user.msg_count} · 积分 {user.total_credits || 0} · {user.last_active ? formatDate(user.last_active) : "未活跃"}
                </div>
              </div>
              <div className="flex-shrink-0">
                {blockConfirm === user.wecom_user_id ? (
                  <div className="flex gap-1">
                    <button onClick={() => handleBlock(user.wecom_user_id, user.blocked)} className={`text-xs text-white rounded-lg px-2 py-1 ${user.blocked ? "bg-green-500" : "bg-red-500"}`}>
                      {user.blocked ? "确认解黑" : "确认拉黑"}
                    </button>
                    <button onClick={() => setBlockConfirm(null)} className="text-xs border rounded-lg px-2 py-1" style={{ borderColor: C.line, color: C.textSub }}>取消</button>
                  </div>
                ) : (
                  <button onClick={() => setBlockConfirm(user.wecom_user_id)} className="p-1.5 rounded-lg" style={{ color: user.blocked ? C.brand : "#9CA3AF" }}>
                    {user.blocked ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 对话日志 Tab
// ═══════════════════════════════════════════════════════════════
interface LogItem {
  id: number;
  wecom_user_id: string;
  user_message: string;
  reply_preview: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

function LogsTab() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const PAGE_SIZE = 20;

  async function fetchLogs(p = 0) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ channel_id: String(KF_CHANNEL_ID), channel_type: KF_CHANNEL_TYPE, limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) });
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) { setLogs(data.logs); setTotal(data.total || 0); setPage(p); }
      else toast.error(data.error || "加载失败");
    } catch { toast.error("网络错误"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchLogs(0); }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: C.textSub }}>共 {total} 条对话记录</span>
        <button onClick={() => fetchLogs(page)} className="p-1.5 rounded-lg" style={{ color: C.brand }}><RefreshCw className="w-4 h-4" /></button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: C.textSub }}>暂无对话记录</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.line }}>
              <button className="w-full px-4 py-3 flex items-start gap-3 text-left" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: C.textMain }}>{log.user_message || "(无内容)"}</div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: C.textSub }}>{log.wecom_user_id} · {formatDate(log.created_at)}</div>
                </div>
                {expanded === log.id ? <ChevronDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.textSub }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.textSub }} />}
              </button>
              {expanded === log.id && (
                <div className="px-4 pb-3 space-y-2 border-t" style={{ borderColor: C.line }}>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: C.textSub }}>用户消息</div>
                    <div className="text-sm p-2 rounded-xl" style={{ backgroundColor: C.bg, color: C.textMain }}>{log.user_message}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: C.textSub }}>AI 回复</div>
                    <div className="text-sm p-2 rounded-xl" style={{ backgroundColor: C.brandLight, color: C.textMain }}>{log.reply_preview}</div>
                  </div>
                  <div className="flex gap-3 text-xs" style={{ color: C.textSub }}>
                    <span>模型：{log.model_used}</span>
                    <span>输入：{log.input_tokens}</span>
                    <span>输出：{log.output_tokens}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => fetchLogs(page - 1)} disabled={page === 0 || loading} className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40" style={{ borderColor: C.line, color: C.brand }}>上一页</button>
          <span className="text-sm" style={{ color: C.textSub }}>{page + 1} / {totalPages}</span>
          <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages - 1 || loading} className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40" style={{ borderColor: C.line, color: C.brand }}>下一页</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 营养俱乐部主页
// ═══════════════════════════════════════════════════════════════
type TabKey = "config" | "rules" | "kb" | "users" | "logs";

const TABS: { key: TabKey; label: string; icon: typeof Bot }[] = [
  { key: "config", label: "配置", icon: Settings },
  { key: "rules", label: "专属规则", icon: Sparkles },
  { key: "kb", label: "知识库", icon: BookOpen },
  { key: "users", label: "用户", icon: Users },
  { key: "logs", label: "日志", icon: MessageSquare },
];

export function NutritionClubPage({ onBack }: { onBack?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>("config");
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabKey, number>>>({});

  useEffect(() => {
    // 并行拉取各 Tab 的数量
    Promise.all([
      fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).filter((r: any) => r.enabled).length : 0).catch(() => 0),
      fetch(`/api/wecom/custom-rules?channel_type=${KF_CHANNEL_TYPE}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).length : 0).catch(() => 0),
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).then(d => d.item_count || 0).catch(() => 0),
      fetch(`/api/wecom/ch/users?channel_type=${KF_CHANNEL_TYPE}`).then(r => r.json()).then(d => (d.users || []).length).catch(() => 0),
      fetch(`/api/wecom/ch/logs?channel_id=${KF_CHANNEL_ID}&channel_type=${KF_CHANNEL_TYPE}&limit=1`).then(r => r.json()).then(d => d.total || 0).catch(() => 0),
    ]).then(([config, rules, kb, users, logs]) => {
      setTabCounts({ config, rules, kb, users, logs });
    });
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: C.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* 顶部栏 */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4"
        style={{ height: 52, background: `linear-gradient(135deg,${C.brandDeep} 0%,${C.brand} 100%)` }}
      >
        <button onClick={() => onBack ? onBack() : window.history.back()} className="p-1.5 rounded-full" style={{ color: "rgba(255,255,255,0.8)" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-[17px] font-bold tracking-wide text-white">营养俱乐部 · AI 客服</span>
        <div className="w-8" />
      </header>

      {/* Tab 切换 */}
      <div className="sticky top-[52px] z-10" style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex">
          {TABS.map(t => {
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs py-2.5 px-1 font-medium transition-colors"
                style={{
                  ...(activeTab === t.key
                    ? { color: C.brand, borderBottom: `2px solid ${C.brand}` }
                    : { color: C.textSub, borderBottom: '2px solid transparent' }),
                  borderRight: t.key !== 'logs' ? `1px solid ${C.line}` : 'none',
                }}
              >
                <span>{t.label}</span>
                <span
                  className="text-[11px] leading-none font-semibold px-1.5 py-0.5 rounded-full mt-0.5"
                  style={activeTab === t.key
                    ? { backgroundColor: C.brandLight, color: C.brand }
                    : { backgroundColor: 'rgba(0,0,0,0.06)', color: C.textSub }}
                >
                  {tabCounts[t.key] !== undefined ? tabCounts[t.key] : '-'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto px-4 pt-2">
        {activeTab === "config" && <ConfigTab />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "kb" && <KnowledgeTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "logs" && <LogsTab />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 路由入口：按 slug 分发到对应项目
// ═══════════════════════════════════════════════════════════════
export default function ProjectLanding() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  if (slug === "proj_69hzg9") {
    return <NutritionClubPage />;
  }

  // 其他 slug：占位页
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "#F7F4F2" }}>
      <div className="text-4xl font-bold text-gray-300 mb-3">{slug}</div>
      <div className="text-gray-500 text-sm">该项目页面正在建设中</div>
    </div>
  );
}
