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
  Shield, ShieldOff, // reserved for future use
  HelpCircle, ChevronLeft,
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

// ═══════════════════════════════════════════════════════════════
// 接入指引弹窗（SetupGuideModal）
// ═══════════════════════════════════════════════════════════════
const SETUP_STEPS = [
  {
    title: "获取企业 ID（CorpID）",
    desc: "企业 ID 是您企业的唯一标识，AI 助手需要它来识别您的企业。",
    steps: [
      "登录企业微信管理后台（work.weixin.qq.com）",
      "点击顶部导航栏的 \"我的企业\"",
      "在左侧菜单选择 \"企业信息\"",
      "滚动到页面最下方，找到 \"企业 ID\"，复制后填入本系统",
    ],
    tip: "企业 ID 格式通常为 ww 开头的字母数字组合，例如：wwa2091bee5a3f125a",
  },
  {
    title: "创建或选择自建应用",
    desc: "AI 助手需要通过一个自建应用来接收和发送客服消息，您需要准备一个并获取其 Secret。",
    steps: [
      "在顶部导航栏点击 \"应用管理\"",
      "向下滚动到 \"自建\" 区域",
      "如已有自建应用可直接点击进入；如没有，点击 \"+ 创建应用\"，起一个名字（如：AI客服助手），上传头像后创建",
      "进入应用详情页，找到 \"Secret\" 字段，点击 \"查看\" 并用企业微信扫码获取",
      "将 Secret 复制后填入本系统",
    ],
    tip: "Secret 是一串随机字符，请妥善保管，不要泄露给他人。",
  },
  {
    title: "配置接收消息（Webhook）",
    desc: "告诉企业微信：当有客户发消息时，请把消息转发给 AI 助手处理。",
    steps: [
      "在自建应用详情页，向下滚动找到 \"接收消息\" 模块",
      "点击 \"设置 API 接收\"",
      "在 URL 输入框中，粘贴本系统为您生成的 Webhook URL",
      "点击 Token 右侧的 \"随机获取\"，再点击 EncodingAESKey 右侧的 \"随机获取\"",
      "将生成的 Token 和 EncodingAESKey 复制后填入本系统，点击保存",
      "回到企业微信后台点击 \"保存\"，提示成功即表示连通验证通过",
    ],
    tip: "请先在本系统填入 Token 和 EncodingAESKey 并保存，再点击企业微信后台的保存，顺序不能颠倒。",
  },
  {
    title: "绑定微信客服",
    desc: "最后一步：将刚才配置的应用与微信客服绑定，让 AI 正式接管客服消息。",
    steps: [
      "在顶部导航栏点击 \"应用管理\"，在基础应用中找到并点击 \"微信客服\"",
      "在微信客服页面，找到 \"API\" 配置入口并点击",
      "在 \"可调用接口的应用\" 中，选择您在第二步中使用的自建应用",
      "在 \"通过 API 管理微信客服账号\" 处，将需要 AI 接管的客服账号切换为 \"企业内部开发\"",
      "保存设置",
    ],
    tip: "完成后，当客户向您的微信客服发消息时，AI 助手将自动回复。",
  },
];

function SetupGuideModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const total = SETUP_STEPS.length;
  const current = SETUP_STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor: C.white, maxHeight: "88vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" style={{ color: C.brand }} />
            <span className="text-base font-bold" style={{ color: C.textMain }}>接入指引</span>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5" style={{ color: C.textSub }} />
          </button>
        </div>

        {/* 步骤进度条 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {SETUP_STEPS.map((_s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="flex-1 h-1.5 rounded-full transition-all"
                style={{ backgroundColor: i <= step ? C.brand : C.line }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: C.textSub }}>第 {step + 1} 步，共 {total} 步</span>
            <span className="text-xs font-medium" style={{ color: C.brand }}>全程约 10 分钟</span>
          </div>
        </div>

        {/* 步骤内容 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* 步骤标题卡片 */}
          <div
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: C.brandLight }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: C.brand }}
              >
                {step + 1}
              </div>
              <span className="text-sm font-bold" style={{ color: C.brandDeep }}>{current.title}</span>
            </div>
            <p className="text-xs pl-8" style={{ color: C.textSub }}>{current.desc}</p>
          </div>

          {/* 操作步骤列表 */}
          <div className="space-y-3 mb-4">
            {current.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: C.line, color: C.brand }}
                >
                  {i + 1}
                </div>
                <p className="text-sm flex-1" style={{ color: C.textMain, lineHeight: 1.6 }}>{s}</p>
              </div>
            ))}
          </div>

          {/* 提示 */}
          <div
            className="rounded-xl p-3 flex items-start gap-2"
            style={{ backgroundColor: "#FFF9E6", border: "1px solid #FFE58F" }}
          >
            <span className="text-sm flex-shrink-0">💡</span>
            <p className="text-xs" style={{ color: "#7A5C00" }}>{current.tip}</p>
          </div>
        </div>

        {/* 底部导航按钮 */}
        <div className="px-5 pb-6 pt-3 flex gap-3 flex-shrink-0" style={{ borderTop: `1px solid ${C.line}` }}>
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-1"
              style={{ borderColor: C.line, color: C.textSub }}
            >
              <ChevronLeft className="w-4 h-4" />上一步
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold border"
              style={{ borderColor: C.line, color: C.textSub }}
            >
              关闭
            </button>
          )}
          {step < total - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-1"
              style={{ backgroundColor: C.brand }}
            >
              下一步<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-1"
              style={{ backgroundColor: C.brand }}
            >
              <Check className="w-4 h-4" />完成配置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 数字分身卡片（客户端只读概览） ────────────────────────────────────────────
function DigitalTwinCard({ channelId }: { channelId: string }) {
  const [stats, setStats] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/wecom/corpus/stats?channel_id=${channelId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) { setStats(d); setEnabled(d.twin_enabled === 1 || d.twin_enabled === true); } })
      .finally(() => setLoading(false));
  }, [channelId]);

  const handleToggle = async () => {
    setToggling(true);
    const newEnabled = !enabled;
    const r = await fetch("/api/wecom/corpus/twin-toggle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId, enabled: newEnabled }),
    });
    const d = await r.json();
    setToggling(false);
    if (d.ok) { setEnabled(newEnabled); toast.success(newEnabled ? "数字分身已开启" : "数字分身已关闭"); }
    else toast.error(d.error || "操作失败");
  };

  const SCENE_LABEL: Record<string, string> = {
    price: "价格咨询", product: "产品介绍", close: "成交转化",
    objection: "异议处理", followup: "跟进维护", other: "其他",
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line }}>
      {/* 标题栏（浅绿背景） */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: C.brandLight, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-semibold" style={{ color: C.textMain }}>我的数字分身</span>
        {/* 与共享知识库完全一致的 toggle 开关 */}
        <div
          onClick={toggling ? undefined : handleToggle}
          style={{
            position: 'relative', display: 'inline-block',
            width: 40, height: 22, borderRadius: 11,
            backgroundColor: enabled ? C.brand : '#D1D5DB',
            cursor: toggling ? 'not-allowed' : 'pointer',
            opacity: toggling ? 0.5 : 1,
            flexShrink: 0, transition: 'background-color 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 3,
            left: enabled ? 19 : 3,
            width: 16, height: 16, borderRadius: '50%',
            backgroundColor: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {/* 数据概览 */}
      <div className="px-4 py-3" style={{ backgroundColor: C.white }}>
        {loading ? (
          <div className="text-center py-4 text-sm" style={{ color: C.textSub }}>加载中…</div>
        ) : (
          <div className="space-y-2">
            {/* 三个指标 */}
            <div className="flex items-baseline gap-4">
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{stats?.quality_count ?? 0}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>优质语料</span></span>
              <span><span className="text-lg font-bold" style={{ color: C.textMain }}>{stats?.total ?? 0}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>总语料</span></span>
              <span><span className="text-base font-bold" style={{ color: C.textMain }}>{stats?.twin_version || 'v1.0'}</span><span className="text-xs ml-0.5" style={{ color: C.textSub }}>版本</span></span>
            </div>
            {/* 覆盖场景标签 */}
            {stats?.scene_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stats.scene_tags.map((s: any) => (
                  <span key={s.tag} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.brandLight, color: C.brand }}>
                    {SCENE_LABEL[s.tag] || s.tag}
                  </span>
                ))}
              </div>
            )}
            {/* 底部更新时间 */}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <span className="text-xs" style={{ color: C.textSub }}>
                {stats?.last_updated ? `更新至 ${new Date(stats.last_updated).toLocaleDateString('zh-CN')}` : '暂无更新记录'}
              </span>
              <span className="text-xs" style={{ color: C.textSub }}>
                分身风格 <span className="font-semibold" style={{ color: enabled ? C.brand : '#9CA3AF' }}>{enabled ? '已开启' : '未开启'}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
interface AiModelOption {
  value: string;
  label: string;
  desc: string;
  group: string;
}
const AI_MODELS: AiModelOption[] = [
  // DeepSeek V4 Flash 系列
  { value: "deepseek-v4-flash",          label: "DeepSeek V4 Flash",          desc: "最新快速模型，日常对话首选，最省积分",     group: "DeepSeek" },
  { value: "deepseek-v4-flash-thinking", label: "DeepSeek V4 Flash 推理版",    desc: "Flash 加开思维链，适合需要分析的问题",   group: "DeepSeek" },
  // DeepSeek V4 Pro 系列
  { value: "deepseek-v4-pro",            label: "DeepSeek V4 Pro",            desc: "最强通用模型，复杂问题、长文写作首选",   group: "DeepSeek" },
  { value: "deepseek-v4-pro-thinking",   label: "DeepSeek V4 Pro 推理版",     desc: "Pro 加深度思考，数学/代码/逻辑推理最强",  group: "DeepSeek" },
  // Manus 系列
  { value: "manus-1.6-lite",             label: "Manus 1.6 Lite",             desc: "轻量模型，响应最快，适合简单问答场景",   group: "Manus" },
  { value: "manus-1.6",                  label: "Manus 1.6 标准",              desc: "平衡能力与速度，适合绝大多数场景",     group: "Manus" },
  { value: "manus-1.6-max",              label: "Manus 1.6 Max",              desc: "最强能力，适合复杂任务，消耗积分较高",   group: "Manus" },
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
function ConfigTab({ onProfileUpdate }: { onProfileUpdate?: (name: string, avatarUrl: string) => void } = {}) {
  const [enabled, setEnabled] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [waitingMsg, setWaitingMsg] = useState("");
  const [waitingEnabled, setWaitingEnabled] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyUserids, setNotifyUserids] = useState<string[]>([]);
  const [showNotifyHelp, setShowNotifyHelp] = useState(false);
  const [showChannelHelp, setShowChannelHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  // 分身基本信息
  const [avatarName, setAvatarName] = useState("营养顾问分身");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarInput, setAvatarInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // 知识库
  const [kbId, setKbId] = useState(0);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  // 客服ID
  const [kfId, setKfId] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQr, setShowQr] = useState(false);
  // 连接信息
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [kbName, setKbName] = useState("");
  const [corpId, setCorpId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cfgRes, kbsRes, chCfgRes, channelRes] = await Promise.all([
          fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`),
          fetch(`/api/wecom/knowledge-bases`),
          fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`),
          fetch(`/api/wecom/channels`),
        ]);
        const cfg = await cfgRes.json();
        const kbs = await kbsRes.json();
        const chCfg = await chCfgRes.json();
        const channelList = await channelRes.json();
        if (cfg.config) {
          const c = cfg.config;
          setEnabled(c.enabled !== false);
          setWelcomeMsg(c.welcome_msg || "");
          setWelcomeEnabled(c.welcome_enabled !== false);
          setWaitingMsg(c.waiting_msg || "");
          setWaitingEnabled(c.waiting_enabled !== false);
          setNotifyEnabled(!!c.notify_enabled);
          setNotifyUserids(c.notify_userids ? (Array.isArray(c.notify_userids) ? c.notify_userids : c.notify_userids.split(",").filter(Boolean)) : []);
          const snap = JSON.stringify({ wm: c.welcome_msg || "", wt: c.waiting_msg || "", ne: !!c.notify_enabled, nu: c.notify_userids || "" });
          setSavedSnapshot(snap);
        }
        if (Array.isArray(kbs)) setKbList(kbs);
        if (chCfg && !chCfg.error) {
          const ki = chCfg.knowledge_base_id || 0;
          setKbId(ki);
          if (chCfg.ai_model) setAiModel(chCfg.ai_model);
          // 找到对应知识库名称
          if (ki && Array.isArray(kbs)) {
            const kb = (kbs as any[]).find((k: any) => k.id === ki);
            if (kb) setKbName(kb.name || "");
          }
        }
        setCorpId("wwbbaccf1da5f886d9");
        // 加载分身名称和头像
        if (channelList?.channels) {
          const ch = channelList.channels.find((c: any) => c.id === KF_CHANNEL_ID);
          if (ch) {
            setAvatarName(ch.name || "营养顾问分身");
            setAvatarUrl(ch.avatar_url || "");
            setKfId(ch.kf_id || "");
          }
        }
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
          welcome_msg: welcomeEnabled ? welcomeMsg : '',
          welcome_enabled: welcomeEnabled ? '1' : '0',
          waiting_msg: waitingEnabled ? waitingMsg : '',
          waiting_enabled: waitingEnabled ? '1' : '0',
          notify_enabled: notifyEnabled ? '1' : '0',
          notify_userids: notifyUserids.join(','),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("保存成功");
        setJustSaved(true);
        const snap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, ne: notifyEnabled, nu: notifyUserids.join(",") });
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

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingProfile(true);
    try {
      // 先获取当前渠道完整信息再更新
      const r = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`);
      const ch = r.ok ? await r.json() : {};
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.trim(),
          channel_type: ch.channel_type || "kf",
          project_key: ch.project_key || null,
          kf_id: ch.kf_id || null,
          is_enabled: ch.is_enabled ?? 1,
          avatar_url: avatarUrl,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setAvatarName(nameInput.trim());
        setEditingName(false);
        toast.success("分身名称已更新");
        onProfileUpdate?.(nameInput.trim(), avatarUrl);
      } else toast.error(d.error || "保存失败");
    } catch { toast.error("网络错误"); }
    finally { setSavingProfile(false); }
  }

  async function handleSaveAvatar() {
    setSavingProfile(true);
    try {
      const r = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`);
      const ch = r.ok ? await r.json() : {};
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: avatarName,
          channel_type: ch.channel_type || "kf",
          project_key: ch.project_key || null,
          kf_id: ch.kf_id || null,
          is_enabled: ch.is_enabled ?? 1,
          avatar_url: avatarInput.trim(),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setAvatarUrl(avatarInput.trim());
        setEditingAvatar(false);
        toast.success("头像已更新");
        onProfileUpdate?.(avatarName, avatarInput.trim());
      } else toast.error(d.error || "保存失败");
    } catch { toast.error("网络错误"); }
    finally { setSavingProfile(false); }
  }


    const currentSnap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, ne: notifyEnabled, nu: notifyUserids.join(",") });
  const isDirty = savedSnapshot === "" || currentSnap !== savedSnapshot;


  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>;
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 接入指引弹窗 */}
      {showGuide && <SetupGuideModal onClose={() => setShowGuide(false)} />}

      {/* 渠道状态 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: C.textMain }}>渠道状态</span>
                <button
                  onClick={() => setShowChannelHelp(v => !v)}
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: C.brand, color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, border: 'none', cursor: 'pointer',
                  }}
                >?</button>
              </div>
              <div className="text-xs mt-0.5" style={{ color: enabled ? C.brand : C.textSub }}>
                {enabled ? "已启用，AI 正在接收消息" : "已停用，AI 不接收消息"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border"
              style={{ borderColor: C.brand, color: C.brand, backgroundColor: C.brandLight }}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              接入指引
            </button>
            <div
              onClick={handleToggleEnabled}
              style={{
                position: 'relative', display: 'inline-block',
                width: 40, height: 22, borderRadius: 11,
                backgroundColor: enabled ? C.brand : '#D1D5DB',
                cursor: 'pointer',
                flexShrink: 0, transition: 'background-color 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: enabled ? 19 : 3,
                width: 16, height: 16, borderRadius: '50%',
                backgroundColor: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>
        {showChannelHelp && (
          <div className="rounded-xl p-3 mt-2 text-xs space-y-2" style={{ backgroundColor: C.brandLight, color: C.textMain, border: `1px solid ${C.line}` }}>
            <div className="font-semibold" style={{ color: C.brand }}>开启状态</div>
            <div style={{ color: C.textSub }}>客户发消息到企业微信客服，AI 自动接收并回复，欢迎语、等待提示语、抄送通知均正常工作。</div>
            <div className="font-semibold" style={{ color: C.brand }}>关闭状态</div>
            <div style={{ color: C.textSub }}>AI 停止自动回复，客户消息将不被处理。适用场景：系统维护、紧急暂停、切换为全人工接待。</div>
            <div className="font-semibold" style={{ color: C.brand }}>注意</div>
            <div style={{ color: C.textSub }}>关闭后客户消息将无人处理，请确认已有人工接待方案再操作。</div>
          </div>
        )}
      </div>

      {/* 欢迎语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: C.textMain }}>欢迎语</div>
          <div
            onClick={() => setWelcomeEnabled(!welcomeEnabled)}
            style={{
              position: 'relative', display: 'inline-block',
              width: 40, height: 22, borderRadius: 11,
              backgroundColor: welcomeEnabled ? C.brand : '#D1D5DB',
              cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: welcomeEnabled ? 19 : 3,
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
        {welcomeEnabled && (
          <input
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            className="w-full text-sm rounded-xl border p-3 outline-none"
            style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
            placeholder="用户首次发消息时自动回复..."
          />
        )}
        {!welcomeEnabled && (
          <div className="text-xs py-1" style={{ color: C.textSub }}>已关闭，不发送欢迎语</div>
        )}
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: C.textMain }}>等待提示语</div>
          <div
            onClick={() => setWaitingEnabled(!waitingEnabled)}
            style={{
              position: 'relative', display: 'inline-block',
              width: 40, height: 22, borderRadius: 11,
              backgroundColor: waitingEnabled ? C.brand : '#D1D5DB',
              cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: waitingEnabled ? 19 : 3,
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
        {waitingEnabled && (
          <input
            value={waitingMsg}
            onChange={(e) => setWaitingMsg(e.target.value)}
            className="w-full text-sm rounded-xl border p-3 outline-none"
            style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
            placeholder="如：收到，AI 正在思考中，请稍候..."
          />
        )}
        {!waitingEnabled && (
          <div className="text-xs py-1" style={{ color: C.textSub }}>已关闭，不发送等待提示语</div>
        )}
      </div>


      {/* 消息抄送 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: C.textMain }}>消息抄送通知</span>
            <button
              onClick={() => setShowNotifyHelp(v => !v)}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                backgroundColor: C.brand, color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, border: 'none', cursor: 'pointer',
              }}
            >?</button>
          </div>
          <div
            onClick={() => setNotifyEnabled(v => !v)}
            style={{
              position: 'relative', display: 'inline-block',
              width: 40, height: 22, borderRadius: 11,
              backgroundColor: notifyEnabled ? C.brand : '#D1D5DB',
              cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: notifyEnabled ? 19 : 3,
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
        {showNotifyHelp && (
          <div className="rounded-xl p-3 mb-2 text-xs space-y-2" style={{ backgroundColor: C.brandLight, color: C.textMain, border: `1px solid ${C.line}` }}>
            <div className="font-semibold" style={{ color: C.brand }}>什么是 userid？</div>
            <div style={{ color: C.textSub }}>userid 是企业微信内部成员的帐号 ID，仅内部员工可收到抄送通知，客户（外部人员）无法收到。</div>
            <div className="font-semibold" style={{ color: C.brand }}>如何查看 userid？</div>
            <div style={{ color: C.textSub }}>方式一：登录企业微信管理后台 → 通讯录 → 点击某个成员 → 查看「账号」字段</div>
            <div style={{ color: C.textSub }}>方式二：手机企业微信 → 我 → 个人信息 → 账号，即为本人 userid</div>
            <div className="font-semibold" style={{ color: C.brand }}>填写示例</div>
            <div style={{ color: C.textSub }}>单人：<span style={{color: C.brand}}>HuXX</span>　多人：<span style={{color: C.brand}}>HuXX,ZhangXX,LiXX</span>（英文逗号分隔）</div>
          </div>
        )}
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


      {/* 推广链接卡片 */}
      {kfId && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.brandLight }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: C.textMain }}>推广链接</div>
              <div className="text-[10px]" style={{ color: C.textSub }}>客户点击后可直接发起咨询</div>
            </div>
          </div>
          {/* 链接展示 */}
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2" style={{ backgroundColor: C.bg, border: `1px solid ${C.line}` }}>
            <span className="flex-1 text-xs truncate" style={{ color: C.textMain }}>
              {`https://work.weixin.qq.com/kfid/${kfId}`}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://work.weixin.qq.com/kfid/${kfId}`).then(() => {
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                });
              }}
              className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
              style={{ backgroundColor: copiedLink ? '#16A34A' : C.brand, color: '#fff' }}
            >
              {copiedLink ? '已复制' : '复制'}
            </button>
          </div>
          {/* 二维码区域 */}
          <div
            onClick={() => setShowQr(v => !v)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h3v3" /><path d="M17 21v-4" /><path d="M21 14v3h-4" />
              </svg>
              <span className="text-xs font-medium" style={{ color: C.brand }}>查看二维码</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {showQr ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
            </svg>
          </div>
          {showQr && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="rounded-xl overflow-hidden p-2" style={{ backgroundColor: '#fff', border: `1px solid ${C.line}` }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`https://work.weixin.qq.com/kfid/${kfId}`)}`}
                  alt="客服二维码"
                  className="w-40 h-40"
                />
              </div>
              <div className="text-[10px] text-center" style={{ color: C.textSub }}>长按或截图保存二维码，分享给客户扫码咨询</div>
            </div>
          )}
        </div>
      )}

      {/* 系统连接总览 */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.line }}>
        {/* 标题行 */}
        <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: C.brand }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
          </svg>
          <span className="text-sm font-semibold text-white">系统连接总览</span>
        </div>

        <div className="divide-y" style={{ backgroundColor: '#fff', borderColor: C.line }}>

          {/* 区块标题：企业微信 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.brand }}>企业微信</span>
          </div>

          {/* 企业号 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>企业号 (Corp ID)</span>
            <span className="text-xs font-mono" style={{ color: C.textMain }}>
              {corpId ? `${corpId.substring(0, 6)}${'*'.repeat(corpId.length - 10)}${corpId.slice(-4)}` : '-'}
            </span>
          </div>

          {/* 客服账号 open_kfid */}
          <div className="px-4 py-2.5 flex items-start justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>客服账号 ID</span>
            <span className="text-xs font-mono text-right break-all max-w-[55%]" style={{ color: C.textMain }}>
              {kfId ? `${kfId.substring(0, 6)}${'*'.repeat(Math.max(0, kfId.length - 10))}${kfId.slice(-4)}` : <span style={{ color: C.textSub }}>未配置</span>}
            </span>
          </div>

          {/* 接入方式 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>接入方式</span>
            <span className="text-xs" style={{ color: C.textMain }}>微信客服 API 回调</span>
          </div>

          {/* 企微连接状态 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>连接状态</span>
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: kfId ? '#16A34A' : '#EF4444' }}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${kfId ? 'bg-green-500' : 'bg-red-400'}`}></span>
              {kfId ? '已连接' : '未配置'}
            </span>
          </div>

          {/* 区块标题： AI 引擎 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.brand }}>AI 引擎</span>
          </div>

          {/* DeepSeek API */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>DeepSeek API</span>
            <span className="text-xs font-mono" style={{ color: C.textMain }}>api.deepseek.com</span>
          </div>

          {/* DeepSeek API Key */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>DeepSeek Key</span>
            <span className="text-xs font-mono" style={{ color: C.textMain }}>sk-***...***已配置</span>
          </div>

          {/* Manus API */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>Manus API</span>
            <span className="text-xs font-mono" style={{ color: C.textMain }}>api.manus.ai/v2</span>
          </div>

          {/* Manus API Key */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>Manus Key</span>
            <span className="text-xs font-mono" style={{ color: C.textMain }}>***已配置</span>
          </div>

          {/* 当前模型 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>当前模型</span>
            <span className="text-xs font-medium" style={{ color: C.textMain }}>
              {AI_MODELS.find(m => m.value === aiModel)?.label || aiModel}
            </span>
          </div>

          {/* 区块标题：知识库 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.brand }}>知识库</span>
          </div>

          {/* 绑定知识库 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>私人知识库</span>
            <span className="text-xs" style={{ color: kbName ? C.textMain : C.textSub }}>{kbName || '未绑定'}</span>
          </div>

          {/* 共享知识库 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>共享知识库</span>
            <span className="text-xs" style={{ color: C.textMain }}>平台共享库（自动接入）</span>
          </div>


        </div>
      </div>

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
// AI 分身 Tab（养成成长系统）
// ═══════════════════════════════════════════════════════════════
// 学历等级体系：以等效知识条数（每条≈100字）为单位
// 等效条数 = 知识库条目×1 + 优质语料×2 + 对话次数×0.1
const AVATAR_LEVELS = [
  { level: 1,  name: "小学生",   label: "基础常识",     threshold: 0     },
  { level: 2,  name: "初中一年级", label: "系统入门",   threshold: 50    },
  { level: 3,  name: "初中二年级", label: "知识扩展",   threshold: 120   },
  { level: 4,  name: "初中三年级", label: "综合提升",   threshold: 250   },
  { level: 5,  name: "高中一年级", label: "专业入门",   threshold: 450   },
  { level: 6,  name: "高中二年级", label: "深度学习",   threshold: 700   },
  { level: 7,  name: "高中三年级", label: "备考冲刺",   threshold: 1000  },
  { level: 8,  name: "大学本科",   label: "专业系统",   threshold: 1500  },
  { level: 9,  name: "硕士研究生", label: "研究深度",   threshold: 2500  },
  { level: 10, name: "博士",       label: "顶尖专业",   threshold: 4000  },
  { level: 11, name: "博士后",     label: "前沿研究",   threshold: 6500  },
  { level: 12, name: "院士",       label: "行业权威",   threshold: 10000 },
];

// 等效知识条数计算（每条≈100字）
function calcEquivCount(kbCount: number, corpusQuality: number, dialogCount: number): number {
  return Math.round(kbCount * 1 + corpusQuality * 2 + dialogCount * 0.1);
}

function calcLevel(kbCount: number, corpusQuality: number, dialogCount: number) {
  const equiv = calcEquivCount(kbCount, corpusQuality, dialogCount);
  let cur = AVATAR_LEVELS[0];
  for (const lv of AVATAR_LEVELS) {
    if (equiv >= lv.threshold) cur = lv;
  }
  const idx = AVATAR_LEVELS.indexOf(cur);
  const next = AVATAR_LEVELS[idx + 1] || null;
  const progress = next
    ? Math.min(100, Math.round(((equiv - cur.threshold) / (next.threshold - cur.threshold)) * 100))
    : 100;
  return { cur, next, equiv, progress };
}

// 5维天赋分数计算
function calcRadarScores(kbCount: number, corpusQuality: number, dialogCount: number, equiv: number, nextThreshold: number) {
  const maxEquiv = Math.max(nextThreshold, equiv + 1);
  // 知识力：知识库条数占比
  const iq = Math.min(100, Math.round((kbCount / Math.max(nextThreshold * 0.6, 1)) * 100));
  // 共情力：优质语料占比
  const eq = Math.min(100, Math.round((corpusQuality / Math.max(nextThreshold * 0.3, 1)) * 100));
  // 抗压力：对话次数占比
  const aq = Math.min(100, Math.round((dialogCount / Math.max(nextThreshold * 2, 1)) * 100));
  // 成交力：综合资产占比
  const sq = Math.min(100, Math.round((equiv / Math.max(maxEquiv, 1)) * 100));
  // 记忆力：对话轮次深度
  const mq = Math.min(100, Math.round((dialogCount / Math.max(dialogCount + 10, 1)) * 100));
  // 初期数据为0时给一个最小值，保持图形可见
  const floor = (v: number) => Math.max(v, 5);
  return [
    { key: 'iq', label: '知识力', score: floor(iq), icon: '🧠' },
    { key: 'eq', label: '共情力', score: floor(eq), icon: '❤️' },
    { key: 'aq', label: '抗压力', score: floor(aq), icon: '💪' },
    { key: 'sq', label: '成交力', score: floor(sq), icon: '🎯' },
    { key: 'mq', label: '记忆力', score: floor(mq), icon: '🔄' },
  ];
}

// Canvas高清雷达图组件
function RadarChart({ scores }: { scores: { label: string; score: number; icon: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const progressRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 2;
    const size = canvas.offsetWidth;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const maxR = size * 0.36;
    const n = scores.length;
    const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

    const drawFrame = (progress: number) => {
      ctx.clearRect(0, 0, size, size);

      // 背景网格：3层同心五边形
      [0.33, 0.66, 1].forEach((ratio, gi) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const r = maxR * ratio;
          const x = cx + r * Math.cos(angle(i));
          const y = cy + r * Math.sin(angle(i));
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = gi === 2 ? 'rgba(39,174,96,0.25)' : 'rgba(39,174,96,0.12)';
        ctx.lineWidth = gi === 2 ? 0.8 : 0.5;
        ctx.stroke();
        // 最外层淡充色
        if (gi === 2) {
          ctx.fillStyle = 'rgba(39,174,96,0.04)';
          ctx.fill();
        }
      });

      // 轴线
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(angle(i)), cy + maxR * Math.sin(angle(i)));
        ctx.strokeStyle = 'rgba(39,174,96,0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // 数据区域（动画）
      const pts = scores.map((s, i) => ({
        x: cx + (maxR * (s.score / 100) * progress) * Math.cos(angle(i)),
        y: cy + (maxR * (s.score / 100) * progress) * Math.sin(angle(i)),
      }));

      // 渐变填充
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(74,222,128,0.45)');
      grad.addColorStop(1, 'rgba(39,174,96,0.15)');
      ctx.fillStyle = grad;
      ctx.fill();

      // 描边
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = '#27AE60';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 顶点光晕
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(74,222,128,0.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
      });
    };

    // easeOutCubic 动画
    const startTime = performance.now();
    const duration = 600;
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      progressRef.current = ease;
      drawFrame(ease);
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [scores.map(s => s.score).join(',')]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function AvatarGrowthTab({ onProfileUpdate }: { onProfileUpdate?: (name: string, avatarUrl: string) => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [kbCount, setKbCount] = useState(0);
  const [kbFileCount, setKbFileCount] = useState(0);
  const [kbCharCount, setKbCharCount] = useState(0);
  const [sysKbEnabled, setSysKbEnabled] = useState(false);
  const [sysKbCount, setSysKbCount] = useState(0);
  const [sysKbCharCount, setSysKbCharCount] = useState(0);
  const [corpusQuality, setCorpusQuality] = useState(0);
  const [dialogCount, setDialogCount] = useState(0);
  const [twinEnabled, setTwinEnabled] = useState(false);
  const [growthHistory, setGrowthHistory] = useState<{date: string; equiv: number; level: string}[]>([]);
  const [showLevelGuide, setShowLevelGuide] = useState(false);
  const [avatarName, setAvatarName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // 知识投喂
  const [feedText, setFeedText] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedingText, setFeedingText] = useState(false);
  const [feedingUrl, setFeedingUrl] = useState(false);
  const [feedResult, setFeedResult] = useState<{show: boolean; count: number; level: string} | null>(null);

  useEffect(() => {
    // 加载分身名称和头像
    fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`)
      .then(r => r.json())
      .then(ch => {
        if (ch && ch.name) setAvatarName(ch.name);
        if (ch && ch.avatar_url) setAvatarUrl(ch.avatar_url);
      })
      .catch(() => {});

    Promise.all([
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/corpus/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/ch/logs?channel_id=${KF_CHANNEL_ID}&channel_type=${KF_CHANNEL_TYPE}&limit=1`).then(r => r.json()).catch(() => ({})),
    ]).then(([kb, sysKb, cfg, corpus, logs]) => {
      const kb_ = kb.item_count || 0;
      const kbFile_ = kb.file_count || 0;
      const kbChar_ = kb.char_count || 0;
      const sysEnabled = !(cfg.disable_system_kb === '1' || cfg.disable_system_kb === 1);
      const sysKb_ = sysKb.item_count || 0;
      const sysKbChar_ = sysKb.char_count || 0;
      const cq_ = corpus.ok ? (corpus.quality_count || 0) : 0;
      const d_  = logs.total || 0;
      setKbCount(kb_);
      setKbFileCount(kbFile_);
      setKbCharCount(kbChar_);
      setSysKbEnabled(sysEnabled);
      setSysKbCount(sysEnabled ? sysKb_ : 0);
      setSysKbCharCount(sysEnabled ? sysKbChar_ : 0);
      setCorpusQuality(cq_);
      setDialogCount(d_);
      setTwinEnabled(corpus.ok && (corpus.twin_enabled === 1 || corpus.twin_enabled === true));
      // 模拟成长历程（实际可从后端拉取快照数据）
      const equiv = calcEquivCount(kb_, cq_, d_);
      const today = new Date();
      const hist: {date: string; equiv: number; level: string}[] = [];
      // 生成过去6个月的模拟增长曲线（按比例递减）
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - i);
        const ratio = (6 - i) / 6;
        const e = Math.round(equiv * ratio * ratio); // 非线性增长
        const lv = AVATAR_LEVELS.reduce((acc, l) => e >= l.threshold ? l : acc, AVATAR_LEVELS[0]);
        hist.push({
          date: `${d.getMonth() + 1}月`,
          equiv: e,
          level: lv.name,
        });
      }
      setGrowthHistory(hist);
    }).finally(() => setLoading(false));
  }, []);

  const { cur, next, equiv, progress } = calcLevel(kbCount, corpusQuality, dialogCount);
  const toNext = next ? next.threshold - equiv : 0;

  // 能力维度
  const ABILITIES = [
    { key: 'product',   label: '产品咨询',   minEquiv: 0,    unlockEquiv: 0,   desc: '回答基础产品问题' },
    { key: 'health',    label: '健康问答',   minEquiv: 50,   unlockEquiv: 50,  desc: '解答常见健康疑问' },
    { key: 'objection', label: '异议处理',   minEquiv: 250,  unlockEquiv: 250, desc: '应对客户质疑和顾虑' },
    { key: 'close',     label: '成交引导',   minEquiv: 700,  unlockEquiv: 700, desc: '主动引导客户下单' },
    { key: 'followup',  label: '跟进维护',   minEquiv: 1500, unlockEquiv: 1500,desc: '主动回访促进复购' },
    { key: 'personal',  label: '个性化方案', minEquiv: 4000, unlockEquiv: 4000,desc: '结合客户情况深度定制' },
  ];

  async function handleFeedText() {
    if (!feedText.trim()) return;
    setFeedingText(true);
    try {
      const r = await fetch('/api/wecom/ch/kb/add-item', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: KF_CHANNEL_ID, content: feedText.trim(), source: 'manual' }),
      });
      const d = await r.json();
      if (d.ok) {
        const newKb = kbCount + 1;
        setKbCount(newKb);
        const newEquiv = calcEquivCount(newKb, corpusQuality, dialogCount);
        const newLv = AVATAR_LEVELS.reduce((acc, l) => newEquiv >= l.threshold ? l : acc, AVATAR_LEVELS[0]);
        setFeedResult({ show: true, count: 1, level: newLv.name });
        setFeedText('');
        setTimeout(() => setFeedResult(null), 4000);
      } else toast.error(d.error || '添加失败');
    } catch { toast.error('网络错误'); }
    finally { setFeedingText(false); }
  }

  async function handleFeedUrl() {
    if (!feedUrl.trim()) return;
    setFeedingUrl(true);
    try {
      const r = await fetch('/api/wecom/ch/kb/add-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: KF_CHANNEL_ID, url: feedUrl.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        const added = d.item_count || 1;
        const newKb = kbCount + added;
        setKbCount(newKb);
        const newEquiv = calcEquivCount(newKb, corpusQuality, dialogCount);
        const newLv = AVATAR_LEVELS.reduce((acc, l) => newEquiv >= l.threshold ? l : acc, AVATAR_LEVELS[0]);
        setFeedResult({ show: true, count: added, level: newLv.name });
        setFeedUrl('');
        setTimeout(() => setFeedResult(null), 4000);
      } else toast.error(d.error || '抓取失败');
    } catch { toast.error('网络错误'); }
    finally { setFeedingUrl(false); }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>;
  }

  // 成长曲线 SVG（只显示已达到的等级刻度）
  const chartW = 320, chartH = 140, padL = 72, padR = 16, padT = 12, padB = 28;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const maxEquiv = Math.max(equiv * 1.2, next ? next.threshold * 1.1 : equiv * 1.5, 10);
  const reachedLevels = AVATAR_LEVELS.filter(l => l.threshold <= equiv);

  const toX = (i: number) => padL + (i / (growthHistory.length - 1)) * innerW;
  const toY = (e: number) => padT + innerH - (e / maxEquiv) * innerH;

  const pathD = growthHistory.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.equiv).toFixed(1)}`
  ).join(' ');

  const radarScores = calcRadarScores(kbCount, corpusQuality, dialogCount, equiv, next ? next.threshold : equiv + 100);

  return (
    <div className="space-y-3 pb-8">

      {/* ── 资产总览卡片（原等级卡片） ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(145deg, ${C.brandDeep} 0%, ${C.brand} 100%)` }}>
        <div className="px-5 pt-5 pb-4">
          {/* 头像 + 名称区块 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-shrink-0">
              <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)' }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" />
                  : <Bot className="w-7 h-7 text-white opacity-80" />}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-base leading-tight truncate">{avatarName}</span>
                <button
                  onClick={() => { setNameInput(avatarName); setEditingName(true); }}
                  className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)' }}
                >设置</button>
              </div>
              <div className="text-white text-[10px] opacity-50 mt-0.5">数字分身</div>
            </div>
          </div>
          {/* 设置面板：编辑分身名称 */}
          {editingName && (
            <div className="mb-4 rounded-xl p-3 space-y-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <div className="text-white text-[11px] font-semibold opacity-80">编辑分身名称</div>
              <input
                className="w-full text-sm border rounded-lg px-3 py-1.5 outline-none"
                style={{ borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                placeholder="输入分身名称…"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={async () => {
                    if (!nameInput.trim()) return;
                    setSavingProfile(true);
                    try {
                      const r = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`);
                      const ch = r.ok ? await r.json() : {};
                      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: nameInput.trim(), channel_type: ch.channel_type || 'kf', project_key: ch.project_key || null, kf_id: ch.kf_id || null, is_enabled: ch.is_enabled ?? 1, avatar_url: avatarUrl }),
                      });
                      const d = await res.json();
                      if (d.ok) {
                        setAvatarName(nameInput.trim());
                        setEditingName(false);
                        toast.success('保存成功');
                        onProfileUpdate?.(nameInput.trim(), avatarUrl);
                      } else toast.error(d.error || '保存失败');
                    } catch { toast.error('网络错误'); }
                    finally { setSavingProfile(false); }
                  }}
                  disabled={savingProfile}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#166534' }}
                >{savingProfile ? '保存中…' : '保存'}</button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-4 py-1.5 rounded-lg text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
                >取消</button>
              </div>
            </div>
          )}
          {/* 账户标题 */}
          <div className="text-white text-[10px] opacity-55 tracking-widest uppercase mb-4">分身资产账户</div>
          {/* 资产总值—大号数字 */}
          {(() => {
            const totalItems = kbCount + sysKbCount;
            const totalChars = kbCharCount + sysKbCharCount;
            const kbNum = sysKbEnabled ? 2 : 1; // 私人库 + 共享库
            const fmtChar = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
            return (
              <>
                <div className="mb-1">
                  <div className="text-white text-[11px] opacity-55 mb-0.5">知识资产总量</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-white font-bold tracking-tight" style={{ fontSize: 36, lineHeight: 1 }}>{totalItems.toLocaleString()}</span>
                    <span className="text-white text-sm opacity-70">条目</span>
                  </div>
                </div>
                {/* 资产明细：库数 / 条目 / 字符 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1">
                    <span className="text-white text-[10px] opacity-45">知识库</span>
                    <span className="text-white text-[11px] font-semibold opacity-80">{kbNum} 个</span>
                  </div>
                  <span className="text-white opacity-25 text-[10px]">/</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white text-[10px] opacity-45">条目</span>
                    <span className="text-white text-[11px] font-semibold opacity-80">{totalItems}</span>
                  </div>
                  <span className="text-white opacity-25 text-[10px]">/</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white text-[10px] opacity-45">字符</span>
                    <span className="text-white text-[11px] font-semibold opacity-80">{fmtChar(totalChars)}</span>
                  </div>
                </div>
              </>
            );
          })()}
          {/* 分隔线 */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 14 }} />
          {/* 克隆完成度 */}
          {(() => {
            const totalItems = kbCount + sysKbCount;
            const MAX_ITEMS = 5000; // 满分 5000 条目 = 100%
            const clonePct = Math.min(100, Math.round((totalItems / MAX_ITEMS) * 100));
            return (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-white text-[10px] opacity-50">克隆完成度</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-white text-lg font-bold leading-none">{clonePct}</span>
                    <span className="text-white text-xs opacity-70">%</span>
                  </div>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${clonePct}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0.6) 0%, #fff 100%)' }} />
                </div>
                {clonePct >= 100
                  ? <div className="text-white text-[10px] opacity-60 mt-1">已完全克隆</div>
                  : <div className="text-white text-[10px] opacity-40 mt-1">持续喂养语料，提升克隆完成度</div>
                }
              </div>
            );
          })()}
      </div>
      </div>

      {/* ── 克隆维度成长曲线 ── */}
      {(() => {
        const knowledgeCur = Math.min(100, Math.round(((kbCount + sysKbCount) / 5000) * 100));
        const memoryCur = Math.min(100, Math.round((dialogCount / 2000) * 100));
        const CLONE_LINES = [
          { key: 'knowledge', label: '专业知识覆盖度', color: '#27AE60', cur: knowledgeCur },
          { key: 'memory',    label: '个人记忆深度',   color: '#3B82F6', cur: memoryCur },
        ];
        const months = growthHistory.length > 0 ? growthHistory.map(h => h.date) : ['1月','2月','3月','4月','5月','6月'];
        const n = months.length;
        const histScores: Record<string, number[]> = {};
        CLONE_LINES.forEach(ab => {
          histScores[ab.key] = Array.from({ length: n }, (_, i) => {
            const ratio = (i + 1) / n;
            return Math.round(ab.cur * ratio * ratio);
          });
        });
        const cW = 320, cH = 160, pL = 32, pR = 16, pT = 16, pB = 28;
        const iW = cW - pL - pR, iH = cH - pT - pB;
        const tx = (i: number) => pL + (n <= 1 ? iW / 2 : (i / (n - 1)) * iW);
        const ty = (v: number) => pT + iH - (v / 100) * iH;
        return (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, border: `1px solid ${C.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.08)' }}>
            <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-wrap gap-1">
              <div className="text-sm font-semibold" style={{ color: C.textMain }}>克隆维度成长曲线</div>
              <div className="flex items-center gap-3">
                {CLONE_LINES.map(ab => (
                  <div key={ab.key} className="flex items-center gap-1">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: ab.color }} />
                    <span className="text-[10px]" style={{ color: C.textSub }}>{ab.label} {ab.cur}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-2 pb-3">
              <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: '100%', height: cH }}>
                {[0,25,50,75,100].map(v => (
                  <g key={v}>
                    <line x1={pL} y1={ty(v)} x2={cW - pR} y2={ty(v)} stroke="#e5e7eb" strokeWidth={0.5} />
                    <text x={pL - 4} y={ty(v) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{v}</text>
                  </g>
                ))}
                {months.map((m, i) => (
                  <text key={i} x={tx(i)} y={cH - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{m}</text>
                ))}
                {CLONE_LINES.map(ab => {
                  const pts = histScores[ab.key];
                  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`).join(' ');
                  return (
                    <g key={ab.key}>
                      <path d={d} fill="none" stroke={ab.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {pts.map((v, i) => (
                        <circle key={i} cx={tx(i)} cy={ty(v)} r={i === pts.length - 1 ? 3.5 : 2} fill={ab.color} />
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* ── 已解锁能力（2列网格） ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, border: `1px solid ${C.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.06)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="text-xs font-bold mb-3" style={{ color: C.textMain }}>分身已解锁的能力</div>
          <div className="grid grid-cols-2 gap-2">
            {ABILITIES.map(ab => {
              const unlocked = equiv >= ab.unlockEquiv;
              const abProgress = unlocked ? 100 : Math.min(99, Math.round((equiv / Math.max(ab.unlockEquiv, 1)) * 100));
              const stillNeed = ab.unlockEquiv - equiv;
              return (
                <div key={ab.key} className="rounded-xl p-3"
                  style={{
                    backgroundColor: unlocked ? C.brandLight : '#F9FAFB',
                    border: `1px solid ${unlocked ? C.brand + '40' : '#E5E7EB'}`,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: unlocked ? C.textMain : '#9CA3AF' }}>{ab.label}</span>
                    <span style={{ fontSize: 14 }}>{unlocked ? '' : ''}</span>
                  </div>
                  <div className="rounded-full overflow-hidden mb-1.5" style={{ height: 3, backgroundColor: unlocked ? 'rgba(39,174,96,0.2)' : 'rgba(0,0,0,0.06)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${abProgress}%`, backgroundColor: unlocked ? C.brand : '#D1D5DB' }} />
                  </div>
                  <div className="text-[10px]" style={{ color: unlocked ? C.brand : '#9CA3AF' }}>
                    {unlocked ? ab.desc : `还差 ${stillNeed.toLocaleString()} 单元`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 投喂成功提示 ── */}
      {feedResult?.show && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${C.brandDeep} 0%, ${C.brand} 100%)` }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <span style={{ fontSize: 18 }}></span>
          </div>
          <div>
            <div className="text-sm font-bold text-white">资产入账！+{feedResult.count} 知识单元</div>
            <div className="text-[11px] text-white mt-0.5" style={{ opacity: 0.75 }}>分身当前等级：{feedResult.level}</div>
          </div>
        </div>
      )}

      {/* ── 存入知识资产 ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, border: `1px solid ${C.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.06)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="text-xs font-bold mb-0.5" style={{ color: C.textMain }}>存入知识资产</div>
          <div className="text-[10px] mb-4" style={{ color: C.textSub }}>投喂的知识将永久存入分身记忆</div>
          {/* 文字存入 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium" style={{ color: C.textMain }}>文字内容</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: C.brandLight, color: C.brand }}>+1 单元</div>
            </div>
            <textarea
              rows={3}
              value={feedText}
              onChange={e => setFeedText(e.target.value)}
              placeholder="粘贴专业知识、产品说明、对话范例…"
              className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none outline-none"
              style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
            />
            <button
              onClick={handleFeedText}
              disabled={!feedText.trim() || feedingText}
              className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: feedText.trim() ? C.brand : '#D1D5DB', color: '#fff', opacity: feedingText ? 0.6 : 1 }}
            >
              {feedingText ? '存入中…' : '存入知识库'}
            </button>
          </div>
          {/* 链接存入 */}
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium" style={{ color: C.textMain }}>网页链接</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>+10~50 单元</div>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={feedUrl}
                onChange={e => setFeedUrl(e.target.value)}
                placeholder="https://… 公众号、健康期刊、专业文章"
                className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
              />
              <button
                onClick={handleFeedUrl}
                disabled={!feedUrl.trim() || feedingUrl}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
                style={{ backgroundColor: feedUrl.trim() ? C.brand : '#D1D5DB', color: '#fff', opacity: feedingUrl ? 0.6 : 1 }}
              >
                {feedingUrl ? '抓取中…' : '抓入'}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AI 智库 Tab（4 层架构）
// ═══════════════════════════════════════════════════════════════
function AIBrainTab() {
  // ── 第①层：AI 指令（从 ConfigTab 迁移） ──
  const [promptRules, setPromptRules] = useState<PromptRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loadingRules, setLoadingRules] = useState(true);

  // ── 第③层：知识库统计（复用 KnowledgeTab 逻辑） ──
  const [kbStats, setKbStats] = useState({ item_count: 0, file_count: 0, char_count: 0, month_count: 0 });
  const [sysKbStats, setSysKbStats] = useState({ item_count: 0, file_count: 0, char_count: 0 });
  const [sysKbEnabled, setSysKbEnabled] = useState(true);
  const [togglingKb, setTogglingKb] = useState(false);
  const [kbId, setKbId] = useState(0);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [savingKbBind, setSavingKbBind] = useState(false);
  const [kbBindSaved, setKbBindSaved] = useState(false);

  // ── 第④层：上下文轮数 ──
  const [contextRounds, setContextRounds] = useState(10);
  const [savingCtx, setSavingCtx] = useState(false);
  const [ctxSaved, setCtxSaved] = useState(false);
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);

  useEffect(() => {
    // 加载第①层：AI 指令
    fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules`)
      .then(r => r.json())
      .then(d => {
        const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d) ? d : [];
        setPromptRules(rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      })
      .finally(() => setLoadingRules(false));

    // 加载第③层：知识库统计
    Promise.all([
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()),
      fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()),
      fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/knowledge-bases`).then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([priv, sys, chCfg, cfg, kbs]) => {
      if (priv.ok) setKbStats({ item_count: priv.item_count || 0, file_count: priv.file_count || 0, char_count: priv.char_count || 0, month_count: priv.month_count || 0 });
      if (sys.ok) setSysKbStats({ item_count: sys.item_count || 0, file_count: sys.file_count || 0, char_count: sys.char_count || 0 });
      setSysKbEnabled(chCfg.disable_system_kb !== '1');
      if (cfg.config) {
        setContextRounds(cfg.config.context_rounds || 10);
        setSystemPrompt(cfg.config.system_prompt || "");
        setKbId(cfg.config.knowledge_base_id || 0);
        if (cfg.config.ai_model) setAiModel(cfg.config.ai_model);
      }
      if (kbs.ok && Array.isArray(kbs.kbs)) setKbList(kbs.kbs);
    });
  }, []);

  const layer1Rules = promptRules.filter(r => r.layer === 1);
  const layer2Rules = promptRules.filter(r => r.layer === 2);

  async function handleSaveRule(rule: PromptRule) {
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editingRuleText }) });
      const d = await res.json();
      if (d.ok || d.rule) { toast.success("已保存"); setEditingRuleId(null); setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_text: editingRuleText, content: editingRuleText } : r)); }
      else toast.error(d.error || "保存失败");
    } catch { toast.error("保存失败"); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(rule: PromptRule) {
    try {
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: rule.enabled ? 0 : 1 }) });
      const d = await res.json();
      if (d.ok || d.rule) setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  }

  async function handleAddRule() {
    if (!newRuleText.trim()) { toast.error("请输入指令内容"); return; }
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layer: 2, category: "custom", content: newRuleText, enabled: 1, sort_order: 1 }) });
      const d = await res.json();
      if (d.rule) {
        toast.success("添加成功"); setAddingRule(false); setNewRuleText("");
        const rulesRes = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules`);
        const rulesData = await rulesRes.json();
        if (Array.isArray(rulesData.rules)) setPromptRules(rulesData.rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
        else if (Array.isArray(rulesData)) setPromptRules(rulesData.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      } else toast.error(d.error || "添加失败");
    } catch { toast.error("添加失败"); }
    finally { setSavingRule(false); }
  }

  async function handleDeleteRule(id: number) {
    try {
      const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/prompt-rules/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success("已删除"); setPromptRules(prev => prev.filter(r => r.id !== id)); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function handleToggleSysKb() {
    setTogglingKb(true);
    try {
      const newVal = !sysKbEnabled;
      const res = await fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disable_system_kb: newVal ? '0' : '1' }) });
      const d = await res.json();
      if (d.ok) { setSysKbEnabled(newVal); toast.success(newVal ? '共享知识库已启用' : '共享知识库已禁用'); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setTogglingKb(false); }
  }

  async function handleSaveContextRounds() {
    setSavingCtx(true);
    try {
      const res = await fetch(`/api/wecom/channel-config/${KF_CHANNEL_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context_rounds: contextRounds }) });
      const d = await res.json();
      if (d.ok) { setCtxSaved(true); toast.success('已保存'); setTimeout(() => setCtxSaved(false), 2000); }
      else toast.error(d.error || '保存失败');
    } catch { toast.error('网络错误'); }
    finally { setSavingCtx(false); }
  }

  // 层级配置（统一绿色系风格）
  const layers = [
    {
      id: 1,
      color: C.brand,
      bgColor: C.brandLight,
      borderColor: C.line,
      label: '① 角色定义 & 行为规则',
      subtitle: 'AI 的基础人设与规则',
      badge: loadingRules ? '-' : `${layer1Rules.length + layer2Rules.length} 条`,
    },
    {
      id: 2,
      color: C.brand,
      bgColor: C.brandLight,
      borderColor: C.line,
      label: '② 我的数字分身',
      subtitle: '客服本人的风格克隆',
      badge: null,
    },
    {
      id: 3,
      color: C.brand,
      bgColor: C.brandLight,
      borderColor: C.line,
      label: '③ 知识库',
      subtitle: '标准答案库（共享 + 私人）',
      badge: `${kbStats.item_count + sysKbStats.item_count} 条`,
    },
    {
      id: 4,
      color: C.brand,
      bgColor: C.brandLight,
      borderColor: C.line,
      label: '④ 历史对话记忆',
      subtitle: 'AI 对客户的理解',
      badge: `${contextRounds} 轮`,
    },
  ];

  return (
    <div className="space-y-3 pb-8 pt-2">
      {/* 4 层卡片 */}
      {layers.map(layer => (
        <div key={layer.id} className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: layer.borderColor }}>
          {/* 标题行 */}
          <div
            className="w-full px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: layer.bgColor }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: layer.color }}>{layer.label}</span>
              {layer.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: layer.color }}>
                  {layer.badge}
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: layer.color, opacity: 0.7 }}>{layer.subtitle}</span>
          </div>

          {/* 内容（常驻展开） */}
          <div className="px-4 pb-4 pt-3 bg-white space-y-3" style={{ borderTop: `1px solid ${layer.borderColor}` }}>

              {/* ── 第①层内容：AI 指令管理 ── */}
              {layer.id === 1 && (
                <div className="space-y-3">
                  {/* 第1层（系统级，只读） */}
                  {layer1Rules.length > 0 && (
                    <div>
                      <div className="text-xs font-medium mb-2" style={{ color: C.textSub }}>系统级指令（只读）</div>
                      {layer1Rules.map(rule => (
                        <div key={rule.id} className="rounded-xl border p-3 mb-2" style={{ borderColor: C.line, backgroundColor: C.bg }}>
                          <div className="text-xs" style={{ color: C.textMain }}>{rule.rule_text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 第2层（自定义） */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium" style={{ color: C.textSub }}>自定义指令</div>
                      <button onClick={() => setAddingRule(true)} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: C.brandLight, color: C.brand }}>
                        <Plus className="w-3 h-3" />添加
                      </button>
                    </div>
                    {layer2Rules.length === 0 && !addingRule && (
                      <div className="text-xs text-center py-4" style={{ color: C.textSub }}>暂无自定义指令，点击右上角添加</div>
                    )}
                    {layer2Rules.map(rule => (
                      <div key={rule.id} className={`rounded-xl border p-3 mb-2 ${!rule.enabled ? 'opacity-50' : ''}`} style={{ borderColor: C.line }}>
                        {editingRuleId === rule.id ? (
                          <div className="space-y-2">
                            <textarea value={editingRuleText} onChange={e => setEditingRuleText(e.target.value)} rows={3} className="w-full text-xs rounded-lg border p-2 resize-none outline-none" style={{ borderColor: C.line }} autoFocus />
                            <div className="flex gap-1.5">
                              <button onClick={() => handleSaveRule(rule)} disabled={savingRule} className="flex-1 py-1.5 rounded-lg text-xs text-white flex items-center justify-center gap-1" style={{ backgroundColor: C.brand }}>
                                {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}保存
                              </button>
                              <button onClick={() => setEditingRuleId(null)} className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: C.line, color: C.textSub }}>取消</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 text-xs" style={{ color: C.textMain }}>{rule.rule_text}</div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => { setEditingRuleId(rule.id); setEditingRuleText(rule.rule_text); }} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: C.line, color: C.textSub }}>编辑</button>
                              <button onClick={() => handleToggleRule(rule)} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: rule.enabled ? C.line : C.brand, color: rule.enabled ? C.textSub : C.brand }}>{rule.enabled ? '停用' : '启用'}</button>
                              <button onClick={() => handleDeleteRule(rule.id)} className="text-xs px-1.5 py-0.5 rounded border border-red-100 text-red-400">删除</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {addingRule && (
                      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: C.brand }}>
                        <div className="relative">
                          <textarea value={newRuleText} onChange={e => setNewRuleText(e.target.value)} rows={9} className="w-full text-sm rounded-lg border p-3 resize-none outline-none" style={{ borderColor: C.brand, color: C.textMain, backgroundColor: C.bg }} placeholder="输入新的 AI 指令，支持多行内容..." autoFocus />
                          {newRuleText.length > 0 && (
                            <button
                              onClick={() => setNewRuleText('')}
                              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: C.textSub }}>{newRuleText.length} 字符</div>
                        <div className="flex gap-1.5">
                          <button onClick={handleAddRule} disabled={savingRule} className="flex-1 py-1.5 rounded-lg text-xs text-white flex items-center justify-center gap-1" style={{ backgroundColor: C.brand }}>
                            {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}添加
                          </button>
                          <button onClick={() => { setAddingRule(false); setNewRuleText(''); }} className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: C.line, color: C.textSub }}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 系统指令文本模式 */}
                  <div>
                    <div className="text-xs font-medium mb-1.5" style={{ color: C.textSub }}>系统指令（文本模式）</div>
                    <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="w-full text-sm rounded-xl border p-3 resize-none outline-none" style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }} placeholder="直接输入 AI 系统指令..." />
                    <div className="text-xs mt-1" style={{ color: C.textSub }}>{systemPrompt.length} 字符</div>
                  </div>
                  {/* 默认 AI 模型 */}
                  <div>
                    <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMain }}>默认 AI 模型</div>
                    <div className="relative">
                      <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm transition-all"
                        style={{ borderColor: showModelDropdown ? C.brand : C.line, backgroundColor: showModelDropdown ? C.brandLight : C.white }}
                      >
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-xs font-medium truncate" style={{ color: C.textMain }}>{AI_MODELS.find(m => m.value === aiModel)?.label || aiModel}</span>
                          <span className="text-xs truncate w-full" style={{ color: C.textSub }}>{AI_MODELS.find(m => m.value === aiModel)?.desc || ""}</span>
                        </div>
                        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2 transition-transform" style={{ color: C.textSub, transform: showModelDropdown ? "rotate(180deg)" : "rotate(0deg)" }} />
                      </button>
                      {showModelDropdown && (
                        <div className="absolute left-0 right-0 top-full mt-1 rounded-2xl border shadow-lg overflow-hidden z-20" style={{ borderColor: C.line, backgroundColor: C.white }}>
                          {["DeepSeek", "Manus"].map(group => (
                            <div key={group}>
                              <div className="px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: C.bg, color: C.textSub }}>{group}</div>
                              {AI_MODELS.filter(m => m.group === group).map((m, idx, arr) => (
                                <button key={m.value} onClick={() => { setAiModel(m.value); setShowModelDropdown(false); setModelSaved(false); }}
                                  className="w-full text-left px-3 py-2.5 flex items-center justify-between transition-all"
                                  style={{ backgroundColor: aiModel === m.value ? C.brandLight : "transparent", borderBottom: idx < arr.length - 1 ? `1px solid ${C.line}` : "none" }}
                                >
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-xs font-medium" style={{ color: aiModel === m.value ? C.brandDeep : C.textMain }}>{m.label}</span>
                                    <span className="text-xs truncate" style={{ color: C.textSub }}>{m.desc}</span>
                                  </div>
                                  {aiModel === m.value && <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: C.brand }} />}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        setSavingModel(true);
                        try {
                          const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_model: aiModel }) });
                          const d = await res.json();
                          if (d.ok) { setModelSaved(true); toast.success('模型已保存'); setTimeout(() => setModelSaved(false), 2000); }
                          else toast.error(d.error || '保存失败');
                        } catch { toast.error('保存失败'); }
                        finally { setSavingModel(false); }
                      }}
                      disabled={savingModel || modelSaved}
                      className="mt-2 w-full py-1.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-60"
                      style={{ backgroundColor: C.brand }}
                    >
                      {savingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : modelSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      {savingModel ? '保存中...' : modelSaved ? '已保存' : '保存模型'}
                    </button>
                  </div>
                  {/* 上下文轮数 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold" style={{ color: C.textMain }}>会话上下文轮数</div>
                      <span className="text-sm font-bold" style={{ color: C.brand }}>{contextRounds} 轮</span>
                    </div>
                    <p className="text-xs mb-2" style={{ color: C.textSub }}>AI 记忆多少轮对话历史，数值越大越消耗积分（建议 5-20）</p>
                    <input type="range" min={1} max={50} value={contextRounds} onChange={e => { setContextRounds(Number(e.target.value)); setCtxSaved(false); }} className="w-full" style={{ accentColor: C.brand }} />
                    <div className="flex justify-between text-xs mt-1" style={{ color: C.textSub }}>
                      <span>1轮（省积分）</span><span>50轮（强记忆）</span>
                    </div>
                    <button
                      onClick={handleSaveContextRounds}
                      disabled={savingCtx || ctxSaved}
                      className="mt-2 w-full py-1.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                      style={{ backgroundColor: C.brand }}
                    >
                      {savingCtx ? <Loader2 className="w-3 h-3 animate-spin" /> : ctxSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      {savingCtx ? '保存中...' : ctxSaved ? '已保存' : '保存设置'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── 第②层内容：数字分身 ── */}
              {layer.id === 2 && (
                <DigitalTwinCard channelId={String(KF_CHANNEL_ID)} />
              )}

              {/* ── 第③层内容：知识库 ── */}
              {layer.id === 3 && (
                <div className="space-y-3">
                  {/* 共享知识库 */}
                  <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: C.textMain }}>平台共享知识库</div>
                        <div className="text-xs mt-0.5" style={{ color: C.textSub }}>{sysKbStats.item_count} 条 · {sysKbStats.file_count} 个文件</div>
                      </div>
                      <div
                        onClick={togglingKb ? undefined : handleToggleSysKb}
                        style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: sysKbEnabled ? C.brand : '#D1D5DB', cursor: togglingKb ? 'not-allowed' : 'pointer', opacity: togglingKb ? 0.5 : 1, flexShrink: 0, transition: 'background-color 0.2s' }}
                      >
                        <div style={{ position: 'absolute', top: 3, left: sysKbEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                  </div>
                  {/* 私人知识库 */}
                  <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: C.textMain }}>我的私人知识库</div>
                        <div className="text-xs mt-0.5" style={{ color: C.textSub }}>{kbStats.item_count} 条 · {kbStats.file_count} 个文件 · 本月新增 {kbStats.month_count}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { /* 跳转到知识库详情 - 复用原 KnowledgeTab */ }}
                      className="w-full py-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1"
                      style={{ borderColor: C.brand, color: C.brand, backgroundColor: C.brandLight }}
                    >
                      <Plus className="w-3 h-3" />管理知识库内容
                    </button>
                  </div>
                  {/* 绑定知识库选择器 */}
                  {kbList.length > 0 && (
                    <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
                      <div className="text-xs font-semibold mb-2" style={{ color: C.textMain }}>绑定知识库（选择一个私人知识库供 AI 优先检索）</div>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => { setKbId(0); setKbBindSaved(false); }}
                          className="w-full text-left text-xs px-3 py-2 rounded-xl border-2 transition-all"
                          style={kbId === 0
                            ? { borderColor: C.textSub, backgroundColor: C.bg, color: C.textSub }
                            : { borderColor: C.line, color: C.textSub }}
                        >不绑定知识库</button>
                        {kbList.map(kb => (
                          <button
                            key={kb.id}
                            onClick={() => { setKbId(kb.id); setKbBindSaved(false); }}
                            className="w-full text-left text-xs px-3 py-2 rounded-xl border-2 transition-all"
                            style={kbId === kb.id
                              ? { borderColor: C.brand, backgroundColor: C.brandLight, color: C.brandDeep }
                              : { borderColor: C.line, color: C.textMain }}
                          >
                            <div className="font-medium">{kb.name}</div>
                            {kb.description && <div className="mt-0.5" style={{ color: C.textSub }}>{kb.description}</div>}
                            <div className="mt-0.5" style={{ color: C.textSub }}>{kb.item_count} 条记录</div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={async () => {
                          setSavingKbBind(true);
                          try {
                            const res = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: kbId }) });
                            const d = await res.json();
                            if (d.ok) { setKbBindSaved(true); toast.success('绑定已保存'); setTimeout(() => setKbBindSaved(false), 2000); }
                            else toast.error(d.error || '保存失败');
                          } catch { toast.error('保存失败'); }
                          finally { setSavingKbBind(false); }
                        }}
                        disabled={savingKbBind || kbBindSaved}
                        className="mt-2 w-full py-1.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-60"
                        style={{ backgroundColor: C.brand }}
                      >
                        {savingKbBind ? <Loader2 className="w-3 h-3 animate-spin" /> : kbBindSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        {savingKbBind ? '保存中...' : kbBindSaved ? '已保存' : '保存绑定'}
                      </button>
                    </div>
                  )}
                  {/* 提示 */}
                  <div className="text-xs rounded-xl p-2.5" style={{ backgroundColor: C.brandLight, color: C.textSub, border: `1px solid ${C.line}` }}>
                    知识库详细管理（上传文件、添加条目、查看内容）请前往「知识库」页面操作。
                  </div>
                </div>
              )}

              {/* ── 第④层内容：历史对话记忆 ── */}
              {layer.id === 4 && (
                <div className="space-y-3">
                  {/* 本轮上下文轮数 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold" style={{ color: C.textMain }}>本轮上下文保留轮数</div>
                      <span className="text-sm font-bold" style={{ color: C.brand }}>{contextRounds} 轮</span>
                    </div>
                    <p className="text-xs mb-3" style={{ color: C.textSub }}>AI 记忆多少轮对话历史，数值越大越消耗积分（建议 5-20）</p>
                    <input type="range" min={1} max={50} value={contextRounds} onChange={e => setContextRounds(Number(e.target.value))} className="w-full" style={{ accentColor: C.brand }} />
                    <div className="flex justify-between text-xs mt-1" style={{ color: C.textSub }}>
                      <span>1轮（省积分）</span><span>50轮（强记忆）</span>
                    </div>
                    <button
                      onClick={handleSaveContextRounds}
                      disabled={savingCtx || ctxSaved}
                      className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                      style={{ backgroundColor: C.brand }}
                    >
                      {savingCtx ? <Loader2 className="w-3 h-3 animate-spin" /> : ctxSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      {savingCtx ? '保存中...' : ctxSaved ? '已保存' : '保存设置'}
                    </button>
                  </div>
                  {/* 客户长期记忆（规划中） */}
                  <div className="rounded-xl border p-3" style={{ borderColor: C.line, backgroundColor: C.brandLight }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: C.brand }}>客户长期偏好记忆</div>
                        <div className="text-xs mt-0.5" style={{ color: C.textSub }}>历史对话提炼，持久化存储客户画像</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: C.line, color: C.brand }}>规划中</span>
                    </div>
                  </div>
                  {/* 说明 */}
                  <div className="text-xs rounded-xl p-2.5" style={{ backgroundColor: C.brandLight, color: C.textSub, border: `1px solid ${C.line}` }}>
                    <span className="font-medium" style={{ color: C.brand }}>提示：</span>已启用数字分身（第②层）后，AI 可通过长期记忆理解用户偏好，短期上下文轮数的重要性自动降低。
                  </div>
                </div>
              )}

          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 知识库 Tab（保留，供 AI 智库第③层跳转）
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
  const [pasteText, setPasteText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);

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
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, opacity: sysKbEnabled ? 1 : 0.7 }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: C.brandLight, borderBottom: `1px solid ${C.line}` }}>
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
            <div className="px-4 py-3" style={{ backgroundColor: C.white }}>
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
          </div>
        );
      })()}

      {/* 私人知识库容器（统计 + 操作 + 文件列表全部包在一起） */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line }}>
        {/* 标题行（浅绿背景） */}
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: C.brandLight, borderBottom: `1px solid ${C.line}` }}>
          <div className="text-xs font-semibold" style={{ color: C.textMain }}>私人知识库</div>
            <div className="relative">
              <div
                onClick={() => !uploading && setShowUploadMenu(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: uploading ? '#aaa' : C.brand,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: 11, color: '#fff', fontWeight: 600, userSelect: 'none' as const,
                  transition: 'background-color 0.2s',
                }}
              >
                +
              </div>
              {showUploadMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUploadMenu(false)} />
                  <div
                    className="absolute right-0 rounded-xl border shadow-lg z-20 overflow-hidden"
                    style={{ top: 'calc(100% + 4px)', minWidth: 120, backgroundColor: C.white, borderColor: C.line }}
                  >
                    <button
                      onClick={() => { setShowUploadMenu(false); if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.setAttribute('capture', 'environment'); } fileInputRef.current?.click(); }}
                      className="w-full px-4 py-2.5 text-sm text-left border-b active:bg-gray-50"
                      style={{ borderColor: C.line, color: C.textMain }}
                    >拍照上传</button>
                    <button
                      onClick={() => { setShowUploadMenu(false); setShowAddModal(true); }}
                      className="w-full px-4 py-2.5 text-sm text-left border-b active:bg-gray-50"
                      style={{ borderColor: C.line, color: C.textMain }}
                    >手写上传</button>
                    <button
                      onClick={() => { setShowUploadMenu(false); if (fileInputRef.current) { fileInputRef.current.accept = '.xlsx,.csv,.pdf,.docx,.txt'; fileInputRef.current.removeAttribute('capture'); } fileInputRef.current?.click(); }}
                      className="w-full px-4 py-2.5 text-sm text-left active:bg-gray-50"
                      style={{ color: C.textMain }}
                    >文件上传</button>
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.csv,.pdf,.docx,.txt" onChange={handleUpload} />
            </div>
        </div>
        {/* 私人知识库统计数据区 */}
        <div className="px-4 py-3 border-b" style={{ backgroundColor: C.white, borderColor: C.line }}>
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
        {/* 粘贴框 + AI 按钮（内嵌右下角） */}
        <div className="px-4 py-3 border-t" style={{ borderColor: C.line, backgroundColor: C.white }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 14, lineHeight: 1.5,
                borderRadius: 12, border: `1px solid ${C.line}`,
                color: C.textMain, backgroundColor: C.bg,
                padding: '10px 46px 10px 10px',
                resize: 'none', outline: 'none', minHeight: 80,
              }}
              placeholder="粘贴文字或链接，AI 自动整理入库..."
            />
            <button
              onClick={async () => {
                if (!pasteText.trim() || aiParsing) return;
                setAiParsing(true);
                try {
                  const r = await fetch('/api/wecom/ch/kb/ai-parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel_type: KF_CHANNEL_TYPE, channel_id: KF_CHANNEL_ID, content: pasteText.trim() }),
                  }).then(x => x.json());
                  if (r.ok) {
                    setPasteText('');
                    toast.success(`AI 已整理 ${r.count} 条知识入库`);
                    loadData();
                  } else {
                    toast.error(r.error || 'AI 解析失败');
                  }
                } catch {
                  toast.error('网络错误，请重试');
                } finally {
                  setAiParsing(false);
                }
              }}
              disabled={!pasteText.trim() || aiParsing}
              style={{
                position: 'absolute',
                right: 'calc(1px + 10px)',
                bottom: 'calc(1px + 10px)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: (!pasteText.trim() || aiParsing) ? '#aaa' : C.brand,
                cursor: (!pasteText.trim() || aiParsing) ? 'not-allowed' : 'pointer',
                fontSize: 11, color: '#fff', fontWeight: 600,
                border: 'none', userSelect: 'none' as const,
                transition: 'background-color 0.2s',
              }}
            >
              {aiParsing ? '…' : 'AI'}
            </button>
          </div>
        </div>
      </div>

      {/* 我的数字分身卡片 */}
      <DigitalTwinCard channelId={String(KF_CHANNEL_ID)} />

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
// 客户数据 Tab（合并原用户Tab + 日志Tab）
// ═══════════════════════════════════════════════════════════════
interface CustomerLog {
  id: number;
  wecom_user_id: string;
  user_message: string;
  reply_preview: string;
  model_used: string;
  credits_used: number;
  created_at: string;
  nickname: string | null;
}

type CdTimeRange = 'all' | 'today' | 'week' | 'month';

function getCdDateRange(range: CdTimeRange): { start: string; end: string } | null {
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
  return null;
}

function CustomerDataTab() {
  // ── 汇总数据 ──
  const [summary, setSummary] = useState<{ total_logs: number; total_users: number; month_logs: number; avg_credits: number; models: string[] } | null>(null);
  // ── 用户列表（用于下拉筛选） ──
  const [allUsers, setAllUsers] = useState<ChannelUser[]>([]);
  // ── 筛选状态 ──
  const [timeRange, setTimeRange] = useState<CdTimeRange>('all');
  const [filterUser, setFilterUser] = useState('');
  const [filterModel, setFilterModel] = useState('');
  // ── 日志列表 ──
  const [logs, setLogs] = useState<CustomerLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  // ── 下拉展开状态 ──
  const [showTimeDD, setShowTimeDD] = useState(false);
  const [showUserDD, setShowUserDD] = useState(false);
  const [showModelDD, setShowModelDD] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const PAGE_SIZE = 20;

  // 初始化：并行加载汇总 + 用户列表
  useEffect(() => {
    Promise.all([
      fetch(`/api/wecom/ch/data/summary?channel_id=${KF_CHANNEL_ID}&channel_type=${KF_CHANNEL_TYPE}`).then(r => r.json()).catch(() => null),
      fetch(`/api/wecom/ch/users?channel_type=${KF_CHANNEL_TYPE}`).then(r => r.json()).catch(() => null),
    ]).then(([sum, usersData]) => {
      if (sum?.ok) setSummary(sum);
      if (usersData?.ok) setAllUsers(usersData.users || []);
    });
  }, []);

  function buildParams(p = 0) {
    const params = new URLSearchParams();
    params.set('channel_id', String(KF_CHANNEL_ID));
    params.set('channel_type', KF_CHANNEL_TYPE);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(p * PAGE_SIZE));
    const dr = getCdDateRange(timeRange);
    if (dr) { params.set('start_date', dr.start); params.set('end_date', dr.end); }
    if (filterUser) params.set('user_id', filterUser);
    if (filterModel) params.set('model', filterModel);
    return params;
  }

  async function fetchLogs(p = 0) {
    setLoading(true);
    try {
      const params = buildParams(p);
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) { setLogs(data.logs); setTotal(data.total || 0); setPage(p); }
      else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }

  // 筛选变化时自动重新请求
  useEffect(() => { fetchLogs(0); }, [timeRange, filterUser, filterModel]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const timeLabels: Record<CdTimeRange, string> = { all: '全部时间', today: '今天', week: '本周', month: '本月' };

  const filteredUsers = allUsers.filter(u =>
    !userSearch || (u.nickname || u.wecom_user_id).toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 20);

  const modelOptions = summary?.models || [];

  return (
    <div className="space-y-3 pb-6">
      {/* ── 数据总览 ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '总对话', value: summary.total_logs, color: C.brand },
            { label: '总用户', value: summary.total_users, color: C.textMain },
            { label: '本月对话', value: summary.month_logs, color: C.brand },
            { label: '均积分/条', value: summary.avg_credits, color: C.textSub },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center border shadow-sm" style={{ borderColor: C.line }}>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: C.textSub }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 筛选栏 ── */}
      <div className="flex gap-2 relative">
        {/* 时间下拉 */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowTimeDD(v => !v); setShowUserDD(false); setShowModelDD(false); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all"
            style={timeRange !== 'all'
              ? { backgroundColor: C.brandLight, borderColor: C.brand, color: C.brand }
              : { backgroundColor: C.white, borderColor: C.line, color: C.textSub }}
          >
            <span>{timeLabels[timeRange]}</span>
            <ChevronRight className="w-3 h-3" style={{ transform: showTimeDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showTimeDD && (
            <div className="absolute top-10 left-0 z-30 rounded-xl shadow-lg w-32 py-1" style={{ backgroundColor: C.white, border: `1px solid ${C.line}` }}>
              {(['all', 'today', 'week', 'month'] as CdTimeRange[]).map(v => (
                <button key={v} onClick={() => { setTimeRange(v); setShowTimeDD(false); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: timeRange === v ? C.brand : C.textMain, fontWeight: timeRange === v ? 600 : 400 }}
                >{timeLabels[v]}</button>
              ))}
            </div>
          )}
        </div>

        {/* 用户下拉 */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowUserDD(v => !v); setShowTimeDD(false); setShowModelDD(false); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all"
            style={filterUser
              ? { backgroundColor: C.brandLight, borderColor: C.brand, color: C.brand }
              : { backgroundColor: C.white, borderColor: C.line, color: C.textSub }}
          >
            <span className="truncate">{filterUser ? (allUsers.find(u => u.wecom_user_id === filterUser)?.nickname || filterUser.slice(0, 8)) : '全部用户'}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ transform: showUserDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showUserDD && (
            <div className="absolute top-10 left-0 z-30 rounded-xl shadow-lg w-52" style={{ backgroundColor: C.white, border: `1px solid ${C.line}` }}>
              <div className="px-3 pt-2 pb-1">
                <input type="text" placeholder="搜索用户…" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                  style={{ border: `1px solid ${C.line}` }} autoFocus />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                <button onClick={() => { setFilterUser(''); setShowUserDD(false); setUserSearch(''); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: !filterUser ? C.brand : C.textMain, fontWeight: !filterUser ? 600 : 400 }}>全部用户</button>
                {filteredUsers.map(u => (
                  <button key={u.wecom_user_id} onClick={() => { setFilterUser(u.wecom_user_id); setShowUserDD(false); setUserSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs truncate"
                    style={{ color: filterUser === u.wecom_user_id ? C.brand : C.textMain, fontWeight: filterUser === u.wecom_user_id ? 600 : 400 }}
                  >{u.nickname || u.wecom_user_id}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 模型下拉 */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowModelDD(v => !v); setShowTimeDD(false); setShowUserDD(false); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all"
            style={filterModel
              ? { backgroundColor: C.brandLight, borderColor: C.brand, color: C.brand }
              : { backgroundColor: C.white, borderColor: C.line, color: C.textSub }}
          >
            <span className="truncate">{filterModel ? filterModel.replace('deepseek-', 'DS-').replace('manus-1.6', 'M1.6') : '全部模型'}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ transform: showModelDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showModelDD && (
            <div className="absolute top-10 right-0 z-30 rounded-xl shadow-lg w-44 py-1" style={{ backgroundColor: C.white, border: `1px solid ${C.line}` }}>
              <button onClick={() => { setFilterModel(''); setShowModelDD(false); }}
                className="w-full text-left px-3 py-2 text-xs"
                style={{ color: !filterModel ? C.brand : C.textMain, fontWeight: !filterModel ? 600 : 400 }}>全部模型</button>
              {modelOptions.map(m => (
                <button key={m} onClick={() => { setFilterModel(m); setShowModelDD(false); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: filterModel === m ? C.brand : C.textMain, fontWeight: filterModel === m ? 600 : 400 }}
                >{m}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 记录数 + 刷新 ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: C.textSub }}>共 {total} 条对话记录</span>
        <button onClick={() => fetchLogs(page)} className="p-1.5 rounded-lg" style={{ color: C.brand }}><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* ── 聊天记录列表 ── */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} /></div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-2" style={{ color: C.line }} />
          <div className="text-sm" style={{ color: C.textSub }}>暂无对话记录</div>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.line }}>
              <button className="w-full px-4 py-3 flex items-start gap-3 text-left"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                {/* 头像 */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: C.brandLight }}>
                  <User className="w-4 h-4" style={{ color: C.brand }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate" style={{ color: C.textMain }}>{log.nickname || log.wecom_user_id.slice(0, 12)}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: C.textSub }}>{formatDate(log.created_at)}</span>
                  </div>
                  <div className="text-sm mt-0.5 line-clamp-1" style={{ color: C.textMain }}>{log.user_message || '(无内容)'}</div>
                  {log.reply_preview && (
                    <div className="text-xs mt-0.5 line-clamp-1" style={{ color: C.textSub }}>{log.reply_preview}</div>
                  )}
                </div>
                {expanded === log.id
                  ? <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: C.textSub }} />
                  : <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: C.textSub }} />}
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
                  <div className="flex gap-3 text-xs flex-wrap" style={{ color: C.textSub }}>
                    {log.model_used && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: C.brandLight, color: C.brand }}>{log.model_used}</span>}
                    {log.credits_used > 0 && <span>{log.credits_used} 积分</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 分页 ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => fetchLogs(page - 1)} disabled={page === 0 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: C.line, color: C.brand }}>上一页</button>
          <span className="text-sm" style={{ color: C.textSub }}>{page + 1} / {totalPages}</span>
          <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages - 1 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: C.line, color: C.brand }}>下一页</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 营养俱乐部主页
// ═══════════════════════════════════════════════════════════════
type TabKey = "avatar" | "config" | "aibrain" | "customers";

const TABS: { key: TabKey; label: string; icon: typeof Bot }[] = [
  { key: "avatar", label: "我的分身", icon: Bot },
  { key: "config", label: "设置", icon: Settings },
  { key: "aibrain", label: "知识库", icon: BookOpen },
  { key: "customers", label: "客户档案", icon: Users },
];

export function NutritionClubPage({ onBack }: { onBack?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>("avatar");
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [channelName, setChannelName] = useState("营养顾问分身");
  const [channelAvatarUrl, setChannelAvatarUrl] = useState("");

  useEffect(() => {
    // 加载分身名称和头像
    fetch(`/api/wecom/channels/${KF_CHANNEL_ID}`)
      .then(r => r.json())
      .then(ch => {
        if (ch && ch.name) setChannelName(ch.name);
        if (ch && ch.avatar_url) setChannelAvatarUrl(ch.avatar_url);
      })
      .catch(() => {});

    // 并行拉取各 Tab 的数量
    Promise.all([
      fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).filter((r: any) => r.enabled).length : 0).catch(() => 0),
      fetch(`/api/wecom/custom-rules?channel_type=${KF_CHANNEL_TYPE}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).length : 0).catch(() => 0),
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).then(d => d.item_count || 0).catch(() => 0),
      fetch(`/api/wecom/ch/logs?channel_id=${KF_CHANNEL_ID}&channel_type=${KF_CHANNEL_TYPE}&limit=1`).then(r => r.json()).then(d => d.total || 0).catch(() => 0),
      fetch(`/api/wecom/corpus/stats?channel_id=${KF_CHANNEL_ID}`).then(r => r.json()).then(d => {
        const corpus = d.ok ? (d.quality_count || 0) : 0;
        return corpus;
      }).catch(() => 0),
    ]).then(([config, rules, aibrain, customers, corpusQuality]) => {
      // 计算 AI 分身等级（简化版，只用 kb+corpus 估算）
      const avatarScore = aibrain * 1 + corpusQuality * 3 + customers * 0.5;
      let avatarLevel = 1;
      const lvThresholds = [0, 100, 300, 700, 1500, 3000];
      for (let i = lvThresholds.length - 1; i >= 0; i--) { if (avatarScore >= lvThresholds[i]) { avatarLevel = i + 1; break; } }
      setTabCounts({ config, rules, aibrain, customers, avatar: avatarLevel });
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
      {/* 顶部栏 - AI 数字銀行风格 */}
      <header
        className="sticky top-0 z-10"
        style={{ background: `linear-gradient(135deg,${C.brandDeep} 0%,${C.brand} 100%)` }}
      >
        {/* 主标题行 */}
        <div className="flex items-center justify-between px-4" style={{ height: 52 }}>
          <button onClick={() => onBack ? onBack() : window.history.back()} className="p-1.5 rounded-full" style={{ color: "rgba(255,255,255,0.8)" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-bold tracking-wide text-white leading-tight">数字分身 · {channelName}</div>
          </div>
          <div className="w-8" />
        </div>
        {/* 当前账户卡片 */}
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              {channelAvatarUrl
                ? <img src={channelAvatarUrl} alt="分身" className="w-full h-full object-cover" />
                : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div>
              <div className="text-white text-[13px] font-semibold leading-tight">{channelName}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab 切换 */}
      <div className="sticky top-[116px] z-10" style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.line}` }}>
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
                  borderRight: t.key !== 'customers' ? `1px solid ${C.line}` : 'none',
                  fontSize: t.key === 'aibrain' ? 11 : undefined,
                  minWidth: t.key === 'aibrain' ? 70 : undefined,
                }}
              >
                <span>{t.label}</span>
                <span
                  className="text-[11px] leading-none font-semibold px-1.5 py-0.5 rounded-full mt-0.5"
                  style={activeTab === t.key
                    ? { backgroundColor: C.brandLight, color: C.brand }
                    : { backgroundColor: 'rgba(0,0,0,0.06)', color: C.textSub }}
                >
                  {t.key === 'avatar'
                    ? (() => { const eq = (tabCounts['aibrain'] || 0) + (tabCounts['customers'] || 0) * 0.1; const pct = Math.min(100, Math.round((eq / 10000) * 100)); return `${pct}%`; })()
                    : (tabCounts[t.key] !== undefined ? tabCounts[t.key] : '-')
                  }
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto px-4 pt-2">
        {activeTab === "avatar" && <AvatarGrowthTab onProfileUpdate={(name, url) => { setChannelName(name); setChannelAvatarUrl(url); }} />}
        {activeTab === "config" && <ConfigTab onProfileUpdate={(name, avatarUrl) => { setChannelName(name); setChannelAvatarUrl(avatarUrl); }} />}
        {activeTab === "aibrain" && <AIBrainTab />}
        {activeTab === "customers" && <CustomerDataTab />}
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
