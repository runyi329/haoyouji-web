/**
 * ProjectConfigTab - 从 ProjectLanding.tsx 抽取的「设置」Tab
 *
 * 用于牙伴院长端（A235）AI配置区，复用 A127 的 ConfigTab 组件。
 * 主题色默认为脉动网蓝色（#2196C8），可通过 theme prop 覆盖。
 *
 * Props:
 *   channelId    - 渠道 ID（牙伴在线固定传 4）
 *   channelType  - 渠道类型（默认 "kf"）
 *   theme        - 主题色对象（默认蓝色系）
 *   onProfileUpdate - 分身名称/头像更新回调
 */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Loader2, HelpCircle, Upload, X, FileText, ImageIcon,
  Copy,
} from "lucide-react";

// ─── 牙伴蓝色主题 ────────────────────────────────────────────────
export const YABAN_THEME = {
  brand: "#2196C8",
  brandDeep: "#1565A0",
  brandLight: "#E3F2FD",
  bg: "#F0F8FF",
  white: "#FFFFFF",
  textMain: "#1A2A3A",
  textSub: "#607D8B",
  line: "#BBDEFB",
} as const;

// ─── 常量 ────────────────────────────────────────────────────────
const DEFAULT_CHANNEL_ID = 4;
const DEFAULT_CHANNEL_TYPE = "kf";
const PLATFORM_PROMPT_CHANNEL_ID = 1;

// ─── 模型选项 ────────────────────────────────────────────────────
const AI_MODELS = [
  { value: "deepseek-v4-flash",          label: "DeepSeek V4 Flash",          desc: "最新快速模型，日常对话首选，最省积分",     group: "DeepSeek" },
  { value: "deepseek-v4-flash-thinking", label: "DeepSeek V4 Flash 推理版",    desc: "Flash 加开思维链，适合需要分析的问题",   group: "DeepSeek" },
  { value: "deepseek-v4-pro",            label: "DeepSeek V4 Pro",            desc: "最强通用模型，复杂问题、长文写作首选",   group: "DeepSeek" },
  { value: "deepseek-v4-pro-thinking",   label: "DeepSeek V4 Pro 推理版",     desc: "Pro 加深度思考，数学/代码/逻辑推理最强",  group: "DeepSeek" },
  { value: "manus-1.6-lite",             label: "Manus 1.6 Lite",             desc: "轻量模型，响应最快，适合简单问答场景",   group: "Manus" },
  { value: "manus-1.6",                  label: "Manus 1.6 标准",              desc: "平衡能力与速度，适合绝大多数场景",     group: "Manus" },
  { value: "manus-1.6-max",              label: "Manus 1.6 Max",              desc: "最强能力，适合复杂任务，消耗积分较高",   group: "Manus" },
];

function providerLabel(provider?: string): string {
  if (!provider) return '-';
  const map: Record<string, string> = {
    hunyuan: '腾讯混元', deepseek: 'DeepSeek', manus: 'Manus', openai: 'OpenAI',
  };
  return map[provider] || provider;
}
function apiHost(apiBase?: string): string {
  if (!apiBase) return '';
  return apiBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
function maskKey(key?: string): string {
  if (!key) return '未配置';
  if (key.length <= 10) return '***已配置';
  return `${key.substring(0, 6)}***...***${key.slice(-4)}`;
}

// ─── 接入指引弹窗 ────────────────────────────────────────────────
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

function SetupGuideModal({ onClose, theme }: { onClose: () => void; theme: typeof YABAN_THEME }) {
  const [step, setStep] = useState(0);
  const s = SETUP_STEPS[step];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white px-5 pt-5 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold" style={{ color: theme.textMain }}>接入指引（{step + 1}/{SETUP_STEPS.length}）</span>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="font-semibold text-sm" style={{ color: theme.brand }}>{s.title}</div>
          <div className="text-xs" style={{ color: theme.textSub }}>{s.desc}</div>
          <ol className="space-y-1.5 list-decimal list-inside">
            {s.steps.map((st, i) => (
              <li key={i} className="text-xs" style={{ color: theme.textMain }}>{st}</li>
            ))}
          </ol>
          {s.tip && (
            <div className="rounded-xl p-3 text-xs" style={{ backgroundColor: theme.brandLight, color: theme.brandDeep }}>
              提示：{s.tip}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 rounded-2xl text-sm border" style={{ borderColor: theme.line, color: theme.textSub }}>上一步</button>
          )}
          {step < SETUP_STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} className="flex-1 py-2.5 rounded-2xl text-sm text-white" style={{ backgroundColor: theme.brand }}>下一步</button>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl text-sm text-white" style={{ backgroundColor: theme.brand }}>完成</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 类型 ────────────────────────────────────────────────────────
interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  item_count: number;
}

// ═══════════════════════════════════════════════════════════════
// ProjectConfigTab - 「设置」Tab
// ═══════════════════════════════════════════════════════════════
export function ProjectConfigTab({
  onProfileUpdate,
  channelId = DEFAULT_CHANNEL_ID,
  channelType = DEFAULT_CHANNEL_TYPE,
  theme = YABAN_THEME,
}: {
  onProfileUpdate?: (name: string, avatarUrl: string) => void;
  channelId?: number;
  channelType?: string;
  theme?: typeof YABAN_THEME;
} = {}) {
  const [enabled, setEnabled] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [waitingMsg, setWaitingMsg] = useState("");
  const [waitingEnabled, setWaitingEnabled] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyUserids, setNotifyUserids] = useState<string[]>([]);
  // 通讯录选人
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberList, setMemberList] = useState<{ userid: string; name: string }[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  async function loadMemberList() {
    setMemberLoading(true);
    setMemberError(null);
    try {
      const r = await fetch('/api/wecom/wecom-users');
      const d = await r.json();
      if (d.error && (!d.users || d.users.length === 0)) {
        setMemberError(d.error.includes('ip') || d.error.includes('IP') || d.error.includes('60020')
          ? 'IP 未加入企微白名单，请在企业微信管理后台添加服务器 IP 后重试'
          : `加载失败：${d.error}`);
      } else {
        setMemberList(d.users || []);
      }
    } catch (e) {
      setMemberError('网络连接失败，请检查网络后重试');
    } finally {
      setMemberLoading(false);
    }
  }
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 分身基本信息
  const [avatarName, setAvatarName] = useState("牙伴AI助手");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [kfId, setKfId] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // 连接信息
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [globalAi, setGlobalAi] = useState<{ provider: string; model_name: string; api_base: string; api_key: string; label?: string } | null>(null);
  const [globalEmbed, setGlobalEmbed] = useState<{ provider: string; model_name: string; api_base: string; api_key: string } | null>(null);
  const [kbName, setKbName] = useState("");
  const [corpId, setCorpId] = useState("");
  const [siteUsername, setSiteUsername] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cfgRes, kbsRes, chCfgRes, channelRes, aiCfgRes] = await Promise.all([
          fetch(`/api/wecom/channels/${channelId}/config`),
          fetch(`/api/wecom/knowledge-bases`),
          fetch(`/api/wecom/channel-config/${channelId}`),
          fetch(`/api/wecom/channels`),
          fetch(`/api/wecom/ai-model-configs`),
        ]);
        const cfg = await cfgRes.json();
        const kbs = await kbsRes.json();
        const chCfg = await chCfgRes.json();
        const channelList = await channelRes.json();
        try {
          const aiCfg = await aiCfgRes.json();
          if (aiCfg?.ok && Array.isArray(aiCfg.configs)) {
            const chatCfg = aiCfg.configs.find((c: any) => c.use_case === "chat_reply");
            if (chatCfg) setGlobalAi({ provider: chatCfg.provider, model_name: chatCfg.model_name, api_base: chatCfg.api_base, api_key: chatCfg.api_key, label: chatCfg.use_case_label });
            const embedCfg = aiCfg.configs.find((c: any) => c.use_case === "embedding");
            if (embedCfg) setGlobalEmbed({ provider: embedCfg.provider, model_name: embedCfg.model_name, api_base: embedCfg.api_base, api_key: embedCfg.api_key });
          }
        } catch (_) {}
        if (cfg.config) {
          const c = cfg.config;
          setEnabled(c.enabled !== false);
          setWelcomeMsg(c.welcome_msg || "");
          // 默认关闭：仅当接口明确返回 '1'/1/true 才开启
          setWelcomeEnabled(c.welcome_enabled === '1' || c.welcome_enabled === 1 || c.welcome_enabled === true);
          setWaitingMsg(c.waiting_msg || "");
          setWaitingEnabled(c.waiting_enabled === '1' || c.waiting_enabled === 1 || c.waiting_enabled === true);
          setNotifyEnabled(!!c.notify_enabled);
          setNotifyUserids(c.notify_userids ? (Array.isArray(c.notify_userids) ? c.notify_userids : c.notify_userids.split(",").filter(Boolean)) : []);
          const snap = JSON.stringify({ wm: c.welcome_msg || "", wt: c.waiting_msg || "", ne: !!c.notify_enabled, nu: c.notify_userids || "" });
          setSavedSnapshot(snap);
        }
        if (chCfg && !chCfg.error) {
          const ki = chCfg.knowledge_base_id || 0;
          if (chCfg.ai_model) setAiModel(chCfg.ai_model);
          if (ki && Array.isArray(kbs)) {
            const kb = (kbs as any[]).find((k: any) => k.id === ki);
            if (kb) setKbName(kb.name || "");
          }
        }
        setCorpId("wwbbaccf1da5f886d9");
        if (channelList?.channels) {
          const ch = channelList.channels.find((c: any) => c.id === channelId);
          if (ch) {
            setAvatarName(ch.name || "牙伴AI助手");
            setAvatarUrl(ch.avatar_url || "");
            setKfId(ch.kf_id || "");
            setSiteUsername(ch.site_username || "");
          }
        }
      } catch {
        toast.error("加载配置失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  async function handleSave() {
    setAutoSaving(true);
    try {
      const r = await fetch(`/api/wecom/channel-config/${channelId}`, {
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
        const snap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, ne: notifyEnabled, nu: notifyUserids.join(",") });
        setSavedSnapshot(snap);
      } else toast.error(d.error || "保存失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setAutoSaving(false);
    }
  }

  // 自动保存：字段变动后 800ms 防抖触发
  useEffect(() => {
    if (loading) return;
    const currentSnap = JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, ne: notifyEnabled, nu: notifyUserids.join(",") });
    if (currentSnap === savedSnapshot) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { handleSave(); }, 800);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeMsg, welcomeEnabled, waitingMsg, waitingEnabled, notifyEnabled, notifyUserids, loading]);

  async function handleToggleEnabled() {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      await fetch(`/api/wecom/channels/${channelId}/config`, {
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

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.brand }} /></div>;
  }

  return (
    <div className="space-y-4 pb-6">
      {showGuide && <SetupGuideModal onClose={() => setShowGuide(false)} theme={theme} />}

      {/* 渠道状态：隐藏，始终保持开启 */}

      {/* 欢迎语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: theme.textMain }}>欢迎语</div>
          <div
            onClick={() => setWelcomeEnabled(!welcomeEnabled)}
            style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: welcomeEnabled ? theme.brand : '#D1D5DB', cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: welcomeEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
          </div>
        </div>
        {welcomeEnabled && (
          <input
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            className="w-full text-sm rounded-xl border p-3 outline-none mt-1"
            style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            placeholder="用户首次发消息时自动回复..."
          />
        )}
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: theme.textMain }}>等待提示语</div>
          <div
            onClick={() => setWaitingEnabled(!waitingEnabled)}
            style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: waitingEnabled ? theme.brand : '#D1D5DB', cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: waitingEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
          </div>
        </div>
        {waitingEnabled && (
          <input
            value={waitingMsg}
            onChange={(e) => setWaitingMsg(e.target.value)}
            className="w-full text-sm rounded-xl border p-3 outline-none mt-1"
            style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            placeholder="如：收到，AI 正在思考中，请稍候..."
          />
        )}
      </div>

      {/* 消息抄送 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: theme.textMain }}>消息抄送通知</span>
          <div
            onClick={() => setNotifyEnabled(v => !v)}
            style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: notifyEnabled ? theme.brand : '#D1D5DB', cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: notifyEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
          </div>
        </div>
        {notifyEnabled && (
          <div className="space-y-2 mt-2">
            {/* 已选成员标签 */}
            {notifyUserids.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {notifyUserids.map(uid => {
                  const member = memberList.find(m => m.userid === uid);
                  const label = member ? member.name : uid;
                  return (
                    <span key={uid} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>
                      {label}
                      <button onClick={() => setNotifyUserids(ids => ids.filter(i => i !== uid))} style={{ lineHeight: 1, color: theme.brand, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 2 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* 选择成员按鈕 */}
            <button
              onClick={() => {
                setShowMemberPicker(true);
                if (memberList.length === 0 && !memberError) loadMemberList();
              }}
              className="w-full text-sm py-2 rounded-xl border flex items-center justify-center gap-1.5"
              style={{ borderColor: theme.brand, color: theme.brand, backgroundColor: 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              选择接收成员
            </button>
            <div className="text-xs" style={{ color: theme.textSub }}>仅企业内部员工可收到抄送通知</div>
          </div>
        )}
      </div>

      {/* 通讯录选人弹层 */}
      {showMemberPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => setShowMemberPicker(false)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white flex flex-col" style={{ maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-bold" style={{ color: theme.textMain }}>选择接收成员</span>
              <button onClick={() => setShowMemberPicker(false)} style={{ color: theme.textSub, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            {/* 搜索框 */}
            <div className="px-5 pb-3">
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="搜索姓名或账号"
                className="w-full text-sm rounded-xl border px-3 py-2 outline-none"
                style={{ borderColor: theme.line, backgroundColor: theme.bg }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {memberLoading ? (
                // 加载中
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: theme.brand }} />
                  <div className="text-xs" style={{ color: theme.textSub }}>正在加载企业通讯录...</div>
                </div>
              ) : memberError ? (
                // 加载失败
                <div className="flex flex-col items-center justify-center py-10 gap-4 px-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="text-sm font-medium" style={{ color: theme.textMain }}>成员列表加载失败</div>
                    <div className="text-xs" style={{ color: theme.textSub }}>{memberError}</div>
                  </div>
                  <button
                    onClick={loadMemberList}
                    className="px-5 py-2 rounded-xl text-sm font-medium"
                    style={{ backgroundColor: theme.brandLight, color: theme.brand }}
                  >重新加载</button>
                </div>
              ) : memberList.length === 0 ? (
                // 加载成功但列表为空
                <div className="text-center py-10 text-xs" style={{ color: theme.textSub }}>企业通讯录中暂无成员</div>
              ) : (
                <div className="space-y-1">
                  {memberList
                    .filter(m => !memberSearch || m.name.includes(memberSearch) || m.userid.toLowerCase().includes(memberSearch.toLowerCase()))
                    .map(m => {
                      const selected = notifyUserids.includes(m.userid);
                      return (
                        <div
                          key={m.userid}
                          onClick={() => setNotifyUserids(ids => selected ? ids.filter(i => i !== m.userid) : [...ids, m.userid])}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                          style={{ backgroundColor: selected ? theme.brandLight : 'transparent' }}
                        >
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${selected ? theme.brand : '#D1D5DB'}`, backgroundColor: selected ? theme.brand : '#fff' }}>
                            {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium" style={{ color: theme.textMain }}>{m.name}</div>
                            <div className="text-xs" style={{ color: theme.textSub }}>{m.userid}</div>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
            <div className="px-5 pb-6 pt-2">
              <button
                onClick={() => setShowMemberPicker(false)}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
                style={{ backgroundColor: theme.brand }}
              >确定（已选 {notifyUserids.length} 人）</button>
            </div>
          </div>
        </div>
      )}

      {/* 推广链接（已隐藏） */}
      {false && kfId && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.brandLight }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: theme.textMain }}>推广链接</div>
              <div className="text-[10px]" style={{ color: theme.textSub }}>客户点击后可直接发起咨询</div>
            </div>
          </div>
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.line}` }}>
            <a
              href={`https://work.weixin.qq.com/kfid/${kfId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-xs truncate"
              style={{ color: theme.brand, textDecoration: 'underline', wordBreak: 'break-all' }}
            >
              {`https://work.weixin.qq.com/kfid/${kfId}`}
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://work.weixin.qq.com/kfid/${kfId}`).then(() => {
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                });
              }}
              className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
              style={{ backgroundColor: copiedLink ? '#16A34A' : theme.brand, color: '#fff' }}
            >
              {copiedLink ? '已复制' : '复制'}
            </button>
          </div>
          <button
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl transition-all active:opacity-70"
            style={{ backgroundColor: theme.brandLight, border: `1px solid ${theme.line}` }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              <path d="M14 14h3v3" /><path d="M17 21v-4" /><path d="M21 14v3h-4" />
            </svg>
            <span className="text-xs font-medium" style={{ color: theme.brand }}>查看二维码</span>
          </button>
          {showQr && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={() => setShowQr(false)}>
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/yxpMOYREnDHtcMuA.png"
                alt="客服二维码"
                className="w-72 h-72"
                style={{ objectFit: 'contain' }}
                onClick={e => e.stopPropagation()}
              />
              <div className="mt-4 text-sm text-white/80">长按或截图保存二维码，分享给客户扫码咨询</div>
              <div className="mt-2 text-xs text-white/50">点击任意处关闭</div>
            </div>
          )}
        </div>
      )}

      {/* 自动保存状态指示 */}
      {autoSaving && (
        <div className="flex items-center justify-center gap-1.5 py-1">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.textSub }} />
          <span className="text-xs" style={{ color: theme.textSub }}>自动保存中...</span>
        </div>
      )}

      {/* 系统连接总览 */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.line }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: theme.brand }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
          </svg>
          <span className="text-sm font-semibold text-white">系统连接总览</span>
        </div>

        <div className="divide-y" style={{ backgroundColor: '#fff', borderColor: theme.line }}>
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>企业微信</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex flex-col flex-shrink-0">
              <span className="text-xs" style={{ color: theme.textSub }}>企业号</span>
              <span className="text-[10px]" style={{ color: theme.textSub, opacity: 0.6 }}>corpid</span>
            </div>
            <span className="text-xs font-mono" style={{ color: theme.textMain }}>
              {corpId ? `${corpId.substring(0, 6)}${'*'.repeat(corpId.length - 10)}${corpId.slice(-4)}` : '-'}
            </span>
          </div>
          <div className="px-4 py-2.5 flex items-start justify-between gap-2">
            <div className="flex flex-col flex-shrink-0">
              <span className="text-xs" style={{ color: theme.textSub }}>客服账号 ID</span>
              <span className="text-[10px]" style={{ color: theme.textSub, opacity: 0.6 }}>open_kfid</span>
            </div>
            <span className="text-xs font-mono text-right break-all max-w-[55%]" style={{ color: theme.textMain }}>
              {kfId ? `${kfId.substring(0, 6)}${'*'.repeat(Math.max(0, kfId.length - 10))}${kfId.slice(-4)}` : <span style={{ color: theme.textSub }}>未配置</span>}
            </span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>接入方式</span>
            <span className="text-xs" style={{ color: theme.textMain }}>微信客服 API 回调</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>连接状态</span>
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: kfId ? '#16A34A' : '#EF4444' }}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${kfId ? 'bg-green-500' : 'bg-red-400'}`}></span>
              {kfId ? '已连接' : '未配置'}
            </span>
          </div>

          <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>AI 引擎</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.brand + '1A', color: theme.brand }}>跟随平台全局</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>服务商</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{providerLabel(globalAi?.provider)}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>API 域名</span>
            <span className="text-xs font-mono text-right break-all max-w-[60%]" style={{ color: theme.textMain }}>{apiHost(globalAi?.api_base) || '-'}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>API Key</span>
            <span className="text-xs font-mono" style={{ color: globalAi?.api_key ? theme.textMain : '#EF4444' }}>{maskKey(globalAi?.api_key)}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>当前模型</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>
              {globalAi?.model_name || (AI_MODELS.find(m => m.value === aiModel)?.label || aiModel)}
            </span>
          </div>

          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>向量引擎·语义检索</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>向量服务</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{providerLabel(globalEmbed?.provider)}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>Embedding API</span>
            <span className="text-xs font-mono text-right break-all max-w-[60%]" style={{ color: theme.textMain }}>{apiHost(globalEmbed?.api_base) || '-'}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>Embedding Key</span>
            <span className="text-xs font-mono" style={{ color: globalEmbed?.api_key ? theme.textMain : '#EF4444' }}>{maskKey(globalEmbed?.api_key)}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>向量模型</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{globalEmbed?.model_name || '-'}</span>
          </div>
          <div className="px-4 py-2.5 flex items-start justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>用途</span>
            <span className="text-xs text-right max-w-[60%]" style={{ color: theme.textMain }}>知识库/规则语义检索与查重</span>
          </div>

          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>知识库</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>私人知识库</span>
            <span className="text-xs" style={{ color: kbName ? theme.textMain : theme.textSub }}>{kbName || '未绑定'}</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>共享知识库</span>
            <span className="text-xs" style={{ color: theme.textMain }}>平台共享库（自动接入）</span>
          </div>

          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>脉动网</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex flex-col flex-shrink-0">
              <span className="text-xs" style={{ color: theme.textSub }}>绑定账户</span>
              <span className="text-[10px]" style={{ color: theme.textSub, opacity: 0.6 }}>site_username</span>
            </div>
            <span className="text-xs font-mono" style={{ color: siteUsername ? theme.textMain : theme.textSub }}>
              {siteUsername || '未绑定'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
