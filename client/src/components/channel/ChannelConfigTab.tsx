/**
 * ChannelConfigTab — 渠道 AI 配置 Tab（可复用于管理员端和牙伴院长端）
 *
 * Props:
 *   channel     — 渠道对象（需含 id, channel_type, name, kf_id, project_key, is_enabled）
 *   onJumpToKb  — 跳转到知识库 Tab 的回调（管理员端用）
 *   yabanMode   — 牙伴院长端模式：隐藏渠道开关/智能路由/公共库/消息抄送/菜单模板
 */
import { useState, useEffect, useRef } from "react";
import {
  Loader2, Save, Check, ChevronDown, ChevronRight, X, Plus, Trash2,
  Bot, Sparkles, Shield, ToggleLeft, ToggleRight, Camera, Pencil, Edit2,
} from "lucide-react";
import { toast } from "sonner";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface Channel {
  id: number;
  name: string;
  channel_type: string;
  kf_id?: string;
  project_key?: string;
  is_enabled?: number;
}

interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  item_count: number;
}

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
  action?: "add" | "merge" | "skip";
  recommendation?: "add" | "skip";
  dedup_reason?: string;
  matched?: string;
};
type KbItemResult = {
  question: string;
  answer: string;
  originalQuestion?: string;
  originalAnswer?: string;
  action?: "add" | "merge" | "skip";
  recommendation?: "add" | "skip";
  dedup_reason?: string;
  matched?: string;
};

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

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const CHANNEL_AI_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek V3", desc: "高性价比" },
  { value: "deepseek-reasoner", label: "DeepSeek R1", desc: "深度推理" },
  { value: "manus-1.6-lite", label: "Manus Lite", desc: "快速省积分" },
  { value: "manus-1.6", label: "Manus 标准", desc: "平衡性能" },
  { value: "manus-1.6-max", label: "Manus Max", desc: "最强能力" },
];

// ─── AiAssistConfigCard ───────────────────────────────────────────────────────

function AiAssistConfigCard({
  channelId, kbId, onApplyPrompt,
}: {
  channelId: number;
  kbId: number;
  systemPrompt: string;
  onApplyPrompt: (addition: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [selectedPrompts, setSelectedPrompts] = useState<boolean[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<boolean[]>([]);
  const [editingPromptIdx, setEditingPromptIdx] = useState<number | null>(null);
  const [editingKbIdx, setEditingKbIdx] = useState<number | null>(null);
  const [editDraftPrompt, setEditDraftPrompt] = useState("");
  const [editDraftQ, setEditDraftQ] = useState("");
  const [editDraftA, setEditDraftA] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
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
        setSelectedPrompts((d.prompt_additions || []).map((p: PromptAddition) => p.recommendation !== "skip"));
        setSelectedKbs((d.kb_items || []).map((k: KbItemResult) => k.recommendation !== "skip"));
      } else {
        toast.error(d.error || "AI分析失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setAnalyzing(false);
    }
  }

  function savePromptEdit(i: number) {
    if (!result) return;
    const updated = [...result.prompt_additions];
    updated[i] = { ...updated[i], content: editDraftPrompt };
    setResult({ ...result, prompt_additions: updated });
    setEditingPromptIdx(null);
  }

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
              body: JSON.stringify({ item_type: "qa", question: item.question, answer: item.answer }),
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
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
          <p className="text-xs text-gray-400 pt-3">用大白话描述你对客服的要求和知识，AI 会自动分类整理，帮你写入 AI 指令或知识库</p>

          <div className="relative">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="例如：客服要有耐心，不要用太官方的语气。我们的产品康宝莱F1单一99元，包含蛋白粉和维生素套餐..."
              rows={5}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pb-10 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 text-gray-800 placeholder-gray-400"
            />
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
                    <span>由 {result.model_used || "AI智能归类"} 分析</span>
                    {result.tokens && <span className="ml-1">· {result.tokens.toLocaleString()} tokens</span>}
                  </div>
                  <div className="text-gray-400">已自动归类：✅ 建议加入已默认勾选，⛔ 已去重默认不勾（可手动调整）</div>
                </div>
              )}

              {result.prompt_additions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-600">建议写入 AI 指令（勾选后会追加到上方指令框）</div>
                  {result.prompt_additions.map((p, i) => (
                    <div key={i} className={`rounded-lg border transition-all ${selectedPrompts[i] ? "border-purple-400 bg-purple-50" : "border-gray-200"}`}>
                      {editingPromptIdx === i ? (
                        <div className="p-2 space-y-2">
                          <textarea
                            value={editDraftPrompt}
                            onChange={e => setEditDraftPrompt(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full text-xs border border-purple-300 rounded px-2 py-1 resize-none focus:outline-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingPromptIdx(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                            <button onClick={() => savePromptEdit(i)} className="text-xs text-purple-600 px-2 py-0.5 rounded hover:bg-purple-100">保存</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 px-3 py-2">
                          <button onClick={() => setSelectedPrompts(prev => { const n = [...prev]; n[i] = !n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedPrompts[i] ? "bg-purple-500 border-purple-500" : "border-gray-300"}`}>
                              {selectedPrompts[i] && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            {p.action === "merge" && p.original ? (
                              <>
                                <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                <span className="block text-xs text-gray-400 line-through whitespace-pre-wrap">{p.original}</span>
                                <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                <span className={`block text-xs whitespace-pre-wrap ${selectedPrompts[i] ? "text-purple-800 font-medium" : "text-gray-400 line-through"}`}>{p.content}</span>
                              </>
                            ) : (
                              <span className={`block text-xs whitespace-pre-wrap ${selectedPrompts[i] ? "text-purple-800" : "text-gray-400 line-through"}`}>{p.content}</span>
                            )}
                            {p.dedup_reason && (
                              <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                p.recommendation === "skip" ? "bg-gray-100 text-gray-500" : p.action === "merge" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                              }`}>
                                {p.recommendation === "skip" ? "⛔ " : p.action === "merge" ? "✂️ " : "✅ "}{p.dedup_reason}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setEditingPromptIdx(i); setEditDraftPrompt(p.content); }} className="flex-shrink-0 text-gray-300 hover:text-purple-500 ml-1">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
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
                    <div key={i} className={`rounded-lg border transition-all ${selectedKbs[i] ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}>
                      {editingKbIdx === i ? (
                        <div className="p-2 space-y-2">
                          <div>
                            <div className="text-xs text-gray-400 mb-0.5">Q 问题</div>
                            <input value={editDraftQ} onChange={e => setEditDraftQ(e.target.value)} autoFocus className="w-full text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none" />
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-0.5">A 答案</div>
                            <textarea value={editDraftA} onChange={e => setEditDraftA(e.target.value)} rows={3} className="w-full text-xs border border-blue-300 rounded px-2 py-1 resize-none focus:outline-none" />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingKbIdx(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-100">取消</button>
                            <button onClick={() => saveKbEdit(i)} className="text-xs text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100">保存</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 px-3 py-2">
                          <button onClick={() => setSelectedKbs(prev => { const n = [...prev]; n[i] = !n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedKbs[i] ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
                              {selectedKbs[i] && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                          <div className="flex-1 text-xs min-w-0">
                            {item.action === "merge" && (item.originalAnswer || item.originalQuestion) ? (
                              <>
                                <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                <div className="text-gray-400 line-through">Q: {item.originalQuestion}</div>
                                <div className="text-gray-400 line-through mt-0.5">A: {item.originalAnswer}</div>
                                <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                <div className={`font-medium ${selectedKbs[i] ? "text-blue-800" : "text-gray-400 line-through"}`}>Q: {item.question}</div>
                                <div className={`mt-0.5 ${selectedKbs[i] ? "text-blue-600" : "text-gray-400 line-through"}`}>A: {item.answer}</div>
                              </>
                            ) : (
                              <>
                                <div className={`font-medium ${selectedKbs[i] ? "text-blue-800" : "text-gray-400 line-through"}`}>Q: {item.question}</div>
                                <div className={`mt-0.5 ${selectedKbs[i] ? "text-blue-600" : "text-gray-400 line-through"}`}>A: {item.answer}</div>
                              </>
                            )}
                            {item.dedup_reason && (
                              <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                item.recommendation === "skip" ? "bg-gray-100 text-gray-500" : item.action === "merge" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                              }`}>
                                {item.recommendation === "skip" ? "⛔ " : item.action === "merge" ? "✂️ " : "✅ "}{item.dedup_reason}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setEditingKbIdx(i); setEditDraftQ(item.question); setEditDraftA(item.answer); }} className="flex-shrink-0 text-gray-300 hover:text-blue-500 ml-1">
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
                    applyDone ? "bg-green-500 text-white" : "bg-gray-800 text-white disabled:opacity-50"
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

// ─── ChannelConfigTab ─────────────────────────────────────────────────────────

export function ChannelConfigTab({
  channel,
  onJumpToKb,
  yabanMode = false,
}: {
  channel: Channel;
  onJumpToKb?: () => void;
  yabanMode?: boolean;
}) {
  const isApp = channel.channel_type === "app";

  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("收到，AI 正在思考中，请稍候...");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [kbId, setKbId] = useState(0);
  const [contextRounds, setContextRounds] = useState(10);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [sharedKbList, setSharedKbList] = useState<{ id: number; name: string; item_count: number }[]>([]);
  const [boundSharedKbIds, setBoundSharedKbIds] = useState<number[]>([]);
  const [savingSharedKb, setSavingSharedKb] = useState(false);

  const [routeEnabled, setRouteEnabled] = useState(false);
  const [classifierModel, setClassifierModel] = useState("deepseek-chat");
  const [fallbackModel, setFallbackModel] = useState("deepseek-chat");

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyUserids, setNotifyUserids] = useState<string[]>([]);
  const [memberList, setMemberList] = useState<{ userid: string; name: string }[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  const [menuKeys, setMenuKeys] = useState<{ key: string; name: string; desc: string; vars: string[] }[]>([]);
  const [menuReplies, setMenuReplies] = useState<Record<string, string>>({});
  const [editingReplies, setEditingReplies] = useState<Record<string, boolean>>({});
  const [savingReplies, setSavingReplies] = useState<Record<string, boolean>>({});

  const PROMPT_CATEGORIES = ["角色定义", "知识库规则", "回复格式", "语气风格", "安全边界"];
  const [promptRules, setPromptRules] = useState<PromptRule[]>([]);
  const [promptRulesOpen, setPromptRulesOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [newRule, setNewRule] = useState({ layer: 2, category: "行为规则", content: "", remark: "" });
  const [savingRule, setSavingRule] = useState(false);
  const [editRuleDraft, setEditRuleDraft] = useState<Partial<PromptRule>>({});

  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [justSaved, setJustSaved] = useState(false);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [draftWelcome, setDraftWelcome] = useState("");
  const [draftWaiting, setDraftWaiting] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(channel.is_enabled !== 0);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

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

  function buildPromptPreview() {
    const layer1 = promptRules.filter(r => r.layer === 1 && r.enabled);
    const layer2 = promptRules.filter(r => r.layer === 2 && r.enabled);
    const parts: string[] = [];
    if (layer1.length > 0) parts.push("【角色定义】\n" + layer1.map(r => r.content).join("\n"));
    if (layer2.length > 0) parts.push("【行为规则】\n" + layer2.map((r, i) => `${i + 1}. ${r.content}`).join("\n"));
    return parts.join("\n\n") || "（暂无启用的指令）";
  }

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
          const replies: Record<string, string> = {};
          Object.keys(d.config).forEach(k => {
            if (k.startsWith("menu_reply_")) replies[k.replace("menu_reply_", "")] = d.config[k];
          });
          setMenuReplies(replies);
        }
        if (menuData && menuData.ok && menuData.menu) {
          const VAR_HINTS: Record<string, { name: string; desc: string; vars: string[] }> = {
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
          const keys: { key: string; name: string; desc: string; vars: string[] }[] = [];
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
          const ne = cfg.notify_enabled === "1" || cfg.notify_enabled === true;
          const nu = cfg.notify_userids ? cfg.notify_userids.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
          setWelcomeMsg(wm);
          setWaitingMsg(wt);
          setSystemPrompt(sp);
          setAiModel(am);
          setKbId(ki);
          setContextRounds(cr);
          setNotifyEnabled(ne);
          setNotifyUserids(nu);
          setSavedSnapshot(JSON.stringify({ wm, wt, sp, am, ki, cr, ne, nu }));
        }
        if (!yabanMode) {
          setMemberLoading(true);
          fetch("/api/wecom/wecom-users").then(r => r.json()).then(d => {
            if (d.users && d.users.length > 0) setMemberList(d.users);
          }).catch(() => {}).finally(() => setMemberLoading(false));
        }
      }
    }).catch(() => toast.error("加载配置失败")).finally(() => setLoading(false));
    loadPromptRules();
    if (!isApp && channel.id && !yabanMode) {
      fetch("/api/wecom/shared-kbs").then(r => r.json()).then((d) => {
        if (Array.isArray(d)) setSharedKbList(d.map((k: any) => ({ id: k.id, name: k.name, item_count: Number(k.item_count || 0) })));
      }).catch(() => {});
      fetch(`/api/wecom/channels/${channel.id}/shared-kbs`).then(r => r.json()).then((d) => {
        if (d && Array.isArray(d.kb_ids)) setBoundSharedKbIds(d.kb_ids);
      }).catch(() => {});
    }
  }, [channel.id, isApp, yabanMode]);

  async function toggleSharedKb(kbIdToToggle: number) {
    const next = boundSharedKbIds.includes(kbIdToToggle)
      ? boundSharedKbIds.filter(id => id !== kbIdToToggle)
      : [...boundSharedKbIds, kbIdToToggle];
    setBoundSharedKbIds(next);
    setSavingSharedKb(true);
    try {
      await fetch(`/api/wecom/channels/${channel.id}/shared-kbs`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kb_ids: next }),
      });
    } catch { toast.error("保存失败"); } finally { setSavingSharedKb(false); }
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
            notify_enabled: notifyEnabled ? "1" : "0",
            notify_userids: notifyUserids.join(","),
          }),
        });
        const d = await res.json();
        if (d.ok) {
          toast.success("配置已保存");
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
      {/* 渠道启用/停用开关（yabanMode 下隐藏） */}
      {!yabanMode && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-800">渠道状态</div>
              <div className="text-xs text-gray-400 mt-0.5">{isEnabled ? "已启用，AI 正在接收消息" : "已停用，AI 不会回复消息"}</div>
            </div>
            <button onClick={handleToggleEnabled} disabled={togglingEnabled} className="flex items-center gap-2 disabled:opacity-50">
              {togglingEnabled
                ? <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
                : isEnabled
                  ? <ToggleRight className="w-16 h-16 text-green-500" />
                  : <ToggleLeft className="w-16 h-16 text-gray-300" />
              }
            </button>
          </div>
        </div>
      )}

      {/* 欢迎语 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">欢迎语</label>
          {!editingWelcome ? (
            <button onClick={() => { setDraftWelcome(welcomeMsg); setEditingWelcome(true); }} className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">编辑</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setWelcomeMsg(draftWelcome); setEditingWelcome(false); }} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-50">取消</button>
              <button onClick={() => setEditingWelcome(false)} className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">完成</button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">用户首次发消息时自动回复，留空则不发送</p>
        {editingWelcome ? (
          <textarea value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} placeholder="输入欢迎语，支持换行" rows={3} autoFocus className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-800 placeholder-gray-400" />
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
            <button onClick={() => { setDraftWaiting(waitingMsg); setEditingWaiting(true); }} className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">编辑</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setWaitingMsg(draftWaiting); setEditingWaiting(false); }} className="text-xs text-gray-400 px-2 py-0.5 rounded hover:bg-gray-50">取消</button>
              <button onClick={() => setEditingWaiting(false)} className="text-xs text-blue-500 px-2 py-0.5 rounded hover:bg-blue-50">完成</button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">用户发消息后、AI 回复前显示的提示，避免用户以为没反应</p>
        {editingWaiting ? (
          <input value={waitingMsg} onChange={e => setWaitingMsg(e.target.value)} placeholder="例如：收到，AI 正在思考中，请稍候..." autoFocus className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        ) : (
          <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            {waitingMsg || <span className="text-gray-400">未设置等待提示语</span>}
          </div>
        )}
      </div>

      {/* 结构化 AI 指令管理 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setPromptRulesOpen(v => !v)}>
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-800">AI 指令管理</span>
            <span className="text-xs text-gray-400">
              第1层 {promptRules.filter(r => r.layer === 1).length}条·第2层 {promptRules.filter(r => r.layer === 2 && r.enabled).length}/{promptRules.filter(r => r.layer === 2).length}条启用
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${promptRulesOpen ? "rotate-180" : ""}`} />
        </button>

        {promptRulesOpen && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
            <div className="relative">
              <input type="text" value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} placeholder="搜索指令内容（查重用）..." className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              {ruleSearch && <button onClick={() => setRuleSearch("")} className="absolute right-2 top-2 text-gray-400"><X className="w-4 h-4" /></button>}
            </div>

            {/* 第一层：角色定义 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-purple-400 rounded-full inline-block"></span>
                  <span className="text-xs font-semibold text-gray-700">第一层·角色定义</span>
                  <span className="text-xs text-gray-400">你是谁、你的边界</span>
                </div>
                <button onClick={() => { setAddingRule(true); setNewRule({ layer: 1, category: "角色定义", content: "", remark: "" }); }} className="text-xs text-purple-500 flex items-center gap-0.5 hover:bg-purple-50 px-2 py-0.5 rounded">
                  <Plus className="w-3 h-3" />新增
                </button>
              </div>
              {promptRules.filter(r => r.layer === 1 && (ruleSearch === "" || r.content.includes(ruleSearch) || r.remark?.includes(ruleSearch))).length === 0 && (
                <div className="text-xs text-gray-400 py-2 text-center bg-gray-50 rounded-lg">暂无角色定义，建议添加一条</div>
              )}
              {promptRules.filter(r => r.layer === 1 && (ruleSearch === "" || r.content.includes(ruleSearch) || r.remark?.includes(ruleSearch))).map(rule => (
                <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? "border-purple-200 bg-purple-50/30" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                  {editingRuleId === rule.id ? (
                    <div className="p-3 space-y-2">
                      <textarea value={editRuleDraft.content ?? rule.content} onChange={e => setEditRuleDraft(d => ({ ...d, content: e.target.value }))} rows={3} className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none" />
                      <input type="text" value={editRuleDraft.remark ?? rule.remark} onChange={e => setEditRuleDraft(d => ({ ...d, remark: e.target.value }))} placeholder="备注（例：2025-06-22 修改）" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
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
                          <button onClick={() => handleToggleRule(rule)}>{rule.enabled ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}</button>
                          <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                      <p className="text-xs text-gray-300 mt-1">更新：{new Date(rule.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
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
                <button onClick={() => { setAddingRule(true); setNewRule({ layer: 2, category: "行为规则", content: "", remark: "" }); }} className="text-xs text-blue-500 flex items-center gap-0.5 hover:bg-blue-50 px-2 py-0.5 rounded">
                  <Plus className="w-3 h-3" />新增
                </button>
              </div>
              {promptRules.filter(r => r.layer === 2 && (ruleSearch === "" || r.content.includes(ruleSearch) || r.category.includes(ruleSearch) || r.remark?.includes(ruleSearch))).length === 0 && (
                <div className="text-xs text-gray-400 py-2 text-center bg-gray-50 rounded-lg">暂无行为规则</div>
              )}
              {promptRules.filter(r => r.layer === 2 && (ruleSearch === "" || r.content.includes(ruleSearch) || r.category.includes(ruleSearch) || r.remark?.includes(ruleSearch))).map(rule => (
                <div key={rule.id} className={`border rounded-lg mb-2 overflow-hidden ${rule.enabled ? "border-blue-200 bg-blue-50/20" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                  {editingRuleId === rule.id ? (
                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <select value={editRuleDraft.category ?? rule.category} onChange={e => setEditRuleDraft(d => ({ ...d, category: e.target.value }))} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none">
                          {PROMPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <textarea value={editRuleDraft.content ?? rule.content} onChange={e => setEditRuleDraft(d => ({ ...d, content: e.target.value }))} rows={3} className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 resize-none focus:outline-none" />
                      <input type="text" value={editRuleDraft.remark ?? rule.remark} onChange={e => setEditRuleDraft(d => ({ ...d, remark: e.target.value }))} placeholder="备注" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
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
                            rule.category === "知识库规则" ? "bg-green-100 text-green-700" :
                            rule.category === "回复格式" ? "bg-orange-100 text-orange-700" :
                            rule.category === "语气风格" ? "bg-pink-100 text-pink-700" :
                            rule.category === "安全边界" ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{rule.category}</span>
                          <span className="text-sm text-gray-800 whitespace-pre-wrap">{rule.content}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleToggleRule(rule)}>{rule.enabled ? <ToggleRight className="w-6 h-6 text-blue-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}</button>
                          <button onClick={() => { setEditingRuleId(rule.id); setEditRuleDraft({}); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {rule.remark && <p className="text-xs text-gray-400 mt-1">📌 {rule.remark}</p>}
                      <p className="text-xs text-gray-300 mt-1">更新：{new Date(rule.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
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
                    <span className="text-xs text-gray-500">已绑定：{kbList.find(kb => kb.id === kbId)?.name || "未绑定"}·{kbList.find(kb => kb.id === kbId)?.item_count || 0}条</span>
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
                  <select value={newRule.layer} onChange={e => setNewRule(r => ({ ...r, layer: Number(e.target.value), category: Number(e.target.value) === 1 ? "角色定义" : "行为规则" }))} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none">
                    <option value={1}>第1层·角色定义</option>
                    <option value={2}>第2层·行为规则</option>
                  </select>
                  {newRule.layer === 2 && (
                    <select value={newRule.category} onChange={e => setNewRule(r => ({ ...r, category: e.target.value }))} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none flex-1">
                      {PROMPT_CATEGORIES.filter(c => c !== "角色定义").map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                {newRule.content.length > 4 && (() => {
                  const similar = promptRules.filter(r => r.content.includes(newRule.content.slice(0, 6)) || newRule.content.includes(r.content.slice(0, 6)));
                  return similar.length > 0 ? (
                    <div className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1.5">⚠️ 发现相似条目：「{similar[0].content.slice(0, 30)}...」，请确认是否重复</div>
                  ) : null;
                })()}
                <textarea value={newRule.content} onChange={e => setNewRule(r => ({ ...r, content: e.target.value }))} placeholder={newRule.layer === 1 ? "例：你是一名专业的口腔健康顾问，性格亲切、专业..." : "例：如果知识库有相关内容，必须严格按照知识库答案回复..."} rows={3} className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 resize-none focus:outline-none" />
                <input type="text" value={newRule.remark} onChange={e => setNewRule(r => ({ ...r, remark: e.target.value }))} placeholder={`备注（例：${new Date().toLocaleDateString("zh-CN")} 新增）`} className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAddingRule(false)} className="text-xs text-gray-400 px-3 py-1 rounded hover:bg-gray-100">取消</button>
                  <button onClick={handleAddRule} disabled={savingRule || !newRule.content.trim()} className="text-xs text-white bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50">
                    {savingRule ? "保存中..." : "添加指令"}
                  </button>
                </div>
              </div>
            )}

            {/* 实时预览 */}
            <div>
              <button onClick={() => setPromptPreviewOpen(v => !v)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${promptPreviewOpen ? "rotate-180" : ""}`} />
                实时预览（发给 AI 的完整指令文本）
              </button>
              {promptPreviewOpen && (
                <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto border border-gray-200">{buildPromptPreview()}</pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI 辅助指令知识库维护 */}
      <AiAssistConfigCard
        channelId={channel.id}
        kbId={kbId}
        systemPrompt={systemPrompt}
        onApplyPrompt={(addition) => setSystemPrompt(prev => prev ? prev + "\n" + addition : addition)}
      />

      {/* AI 模型选择（非 app 渠道） */}
      {!isApp && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">默认 AI 模型</label>
          <div className="grid grid-cols-1 gap-2">
            {CHANNEL_AI_MODELS.map(m => (
              <button key={m.value} onClick={() => setAiModel(m.value)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${aiModel === m.value ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-gray-400">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 自建应用：AI 智能路由（yabanMode 下隐藏） */}
      {isApp && !yabanMode && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">AI 智能路由</label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-700">智能路由开关</div>
                <div className="text-xs text-gray-400">开启后系统自动判断每条消息派给哪个模型</div>
              </div>
              <button onClick={() => setRouteEnabled(!routeEnabled)}>
                {routeEnabled ? <ToggleRight className="w-8 h-8 text-blue-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <div>
                <div className="text-sm text-gray-700">前置分类模型</div>
                <div className="text-xs text-gray-400">判断消息应派给谁，建议轻量级</div>
              </div>
              <select value={classifierModel} onChange={e => setClassifierModel(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                <option value="deepseek-chat">DeepSeek Flash（推荐）</option>
                <option value="manus-1.6-lite">Manus 轻量（推荐）</option>
                <option value="manus-1.6">Manus 标准</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <div>
                <div className="text-sm text-gray-700">兜底模型</div>
                <div className="text-xs text-gray-400">分类失败时使用</div>
              </div>
              <select value={fallbackModel} onChange={e => setFallbackModel(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                <option value="deepseek-chat">DeepSeek Flash</option>
                <option value="manus-1.6-lite">Manus 轻量</option>
                <option value="manus-1.6">Manus 标准</option>
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
        <input type="range" min={1} max={50} value={contextRounds} onChange={e => setContextRounds(Number(e.target.value))} className="w-full accent-blue-500" />
        <div className="flex justify-between text-xs text-gray-300 mt-1">
          <span>1轮（省积分）</span>
          <span>50轮（强记忆）</span>
        </div>
      </div>

      {/* 绑定知识库（非 app 渠道） */}
      {!isApp && kbList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">绑定知识库</label>
          <div className="space-y-2">
            <button onClick={() => setKbId(0)} className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${kbId === 0 ? "border-gray-400 bg-gray-50 text-gray-700" : "border-gray-200 text-gray-500"}`}>
              不绑定知识库
            </button>
            {kbList.map(kb => (
              <button key={kb.id} onClick={() => setKbId(kb.id)} className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${kbId === kb.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                <div className="font-medium">{kb.name}</div>
                {kb.description && <div className="text-xs text-gray-400 mt-0.5">{kb.description}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{kb.item_count} 条记录</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 调用平台公共库（yabanMode 下隐藏） */}
      {!isApp && !yabanMode && sharedKbList.length > 0 && (
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
                <button key={kb.id} onClick={() => toggleSharedKb(kb.id)} className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${checked ? "border-green-400 bg-green-50" : "border-gray-200"}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-green-500 border-green-500" : "border-gray-300"}`}>{checked && <Check className="w-3 h-3 text-white" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${checked ? "text-green-700" : "text-gray-700"}`}>{kb.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{kb.item_count} 条内容</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 消息抄送（yabanMode 下隐藏） */}
      {!isApp && !yabanMode && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">消息抄送通知</div>
              <div className="text-xs text-gray-400 mt-0.5">AI 回复客户后，同步抄送一份给指定成员的企业微信</div>
            </div>
            <button onClick={() => setNotifyEnabled(v => !v)}>
              {notifyEnabled ? <ToggleRight className="w-8 h-8 text-blue-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            </button>
          </div>
          {notifyEnabled && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-1">选择抄送接收人（可多选）</div>
              {memberLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2"><Loader2 className="w-3 h-3 animate-spin" />加载成员列表...</div>
              ) : memberList.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {memberList.map(m => (
                    <button key={m.userid} onClick={() => setNotifyUserids(prev => prev.includes(m.userid) ? prev.filter(id => id !== m.userid) : [...prev, m.userid])} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${notifyUserids.includes(m.userid) ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                      <span>{m.name}</span>
                      <span className="text-xs text-gray-400">{m.userid}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-amber-500 bg-amber-50 rounded-lg px-3 py-2">成员列表加载失败（IP白名单限制），请手动输入 userid</div>
                  <input value={notifyUserids.join(",")} onChange={e => setNotifyUserids(e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="输入 userid，多个用英文逗号分隔" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              )}
              {notifyUserids.length > 0 && (
                <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-1">已选 {notifyUserids.length} 人接收抄送：{notifyUserids.join("、")}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 菜单回复模板（yabanMode 下隐藏） */}
      {isApp && !yabanMode && menuKeys.length > 0 && (
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
                  <button onClick={() => setEditingReplies(v => ({ ...v, [item.key]: true }))} className="text-xs text-blue-500 border border-blue-200 rounded px-2 py-1">编辑</button>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => setEditingReplies(v => ({ ...v, [item.key]: false }))} className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1">取消</button>
                    <button disabled={savingReplies[item.key]} onClick={async () => {
                      setSavingReplies(v => ({ ...v, [item.key]: true }));
                      try {
                        const res = await fetch("/api/wecom/route-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: { [`menu_reply_${item.key}`]: menuReplies[item.key] || "" } }) });
                        const d = await res.json();
                        if (d.ok) { toast.success(`「${item.name}」已保存`); setEditingReplies(v => ({ ...v, [item.key]: false })); }
                        else toast.error(d.error || "保存失败");
                      } catch { toast.error("保存失败"); }
                      finally { setSavingReplies(v => ({ ...v, [item.key]: false })); }
                    }} className="text-xs text-white bg-blue-600 rounded px-2 py-1 disabled:opacity-50">
                      {savingReplies[item.key] ? "..." : "保存"}
                    </button>
                  </div>
                )}
              </div>
              {editingReplies[item.key] ? (
                <textarea value={menuReplies[item.key] || ""} onChange={e => setMenuReplies(prev => ({ ...prev, [item.key]: e.target.value }))} placeholder="输入回复内容，留空使用默认回复" rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200" />
              ) : (
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 whitespace-pre-wrap min-h-[40px]">{menuReplies[item.key] || "（使用默认回复）"}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 保存按钮 */}
      {(() => {
        const currentSnap = !isApp ? JSON.stringify({ wm: welcomeMsg, wt: waitingMsg, sp: systemPrompt, am: aiModel, ki: kbId, cr: contextRounds, ne: notifyEnabled, nu: notifyUserids }) : null;
        const isDirty = isApp || (savedSnapshot === "" || currentSnap !== savedSnapshot);
        return (
          <button
            onClick={handleSave}
            disabled={saving || justSaved || (!isApp && !isDirty)}
            className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              saving ? "bg-blue-400 text-white opacity-80"
              : justSaved ? "bg-green-500 text-white"
              : isDirty ? "bg-blue-600 text-white active:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
              : justSaved ? <><Check className="w-4 h-4" />已保存</>
              : <><Save className="w-4 h-4" />{isDirty ? "保存配置" : "配置未更改"}</>}
          </button>
        );
      })()}
    </div>
  );
}
