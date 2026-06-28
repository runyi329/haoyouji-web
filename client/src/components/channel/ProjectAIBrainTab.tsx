/**
 * ProjectAIBrainTab - 从 ProjectLanding.tsx 抽取的「知识库」Tab
 *
 * 用于牙伴院长端（A235）AI配置区，复用 A127 的 AIBrainTab 组件。
 * 主题色默认为脉动网蓝色，隐藏「我的数字分身」层（yabanMode）。
 *
 * Props:
 *   channelId    - 渠道 ID（牙伴在线固定传 4）
 *   channelType  - 渠道类型（默认 "kf"）
 *   theme        - 主题色对象（默认蓝色系）
 *   refreshKey   - 刷新触发器
 *   hideDigitalTwin - 是否隐藏「我的数字分身」层（默认 true）
 */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Loader2, Upload, Plus, Trash2, ChevronRight, Save, RefreshCw,
  FileText, X, Sparkles, Check, HelpCircle, Camera, Pencil, Mail, Copy,
  ImageIcon,
} from "lucide-react";
import { YABAN_THEME } from "./ProjectConfigTab";

// ─── 常量 ────────────────────────────────────────────────────────
const DEFAULT_CHANNEL_ID = 4;
const DEFAULT_CHANNEL_TYPE = "kf";
const PLATFORM_PROMPT_CHANNEL_ID = 1;
const SYS_KB_CHANNEL_ID = 2;

// ─── 类型 ────────────────────────────────────────────────────────
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

interface Material {
  id: number;
  type: string;
  title: string;
  description: string;
  storage_url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
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

// ─── 素材库卡片 ──────────────────────────────────────────────────
function MaterialsCard({ channelId, theme = YABAN_THEME }: { channelId: number; theme?: typeof YABAN_THEME }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const matFileRef = useRef<HTMLInputElement>(null);

  async function loadMaterials() {
    setLoading(true);
    try {
      const res = await fetch(`/api/wecom/materials?channel_id=${channelId}`);
      const d = await res.json();
      if (d.ok) setMaterials(d.materials || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadMaterials(); }, [channelId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
    if (file.type.startsWith("image/")) {
      setUploadPreview(URL.createObjectURL(file));
    } else {
      setUploadPreview(null);
    }
    setShowUploadModal(true);
    if (matFileRef.current) matFileRef.current.value = "";
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("channel_id", String(channelId));
      form.append("title", uploadTitle.trim() || uploadFile.name);
      form.append("description", uploadDesc.trim());
      const res = await fetch("/api/wecom/materials/upload", { method: "POST", body: form });
      const d = await res.json();
      if (d.ok) {
        toast.success("素材上传成功");
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadTitle("");
        setUploadDesc("");
        setUploadPreview(null);
        loadMaterials();
      } else {
        toast.error(d.error || "上传失败");
      }
    } catch (_) {
      toast.error("网络错误");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveEdit(id: number) {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/wecom/materials/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("已保存");
        setEditingId(null);
        loadMaterials();
      } else {
        toast.error(d.error || "保存失败");
      }
    } catch (_) {
      toast.error("网络错误");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/wecom/materials/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) {
        toast.success("已删除");
        setDeleteConfirm(null);
        loadMaterials();
      } else {
        toast.error(d.error || "删除失败");
      }
    } catch (_) {
      toast.error("网络错误");
    }
  }

  function getTypeIcon(type: string) {
    if (type === "image") return <ImageIcon className="w-4 h-4" style={{ color: theme.brand }} />;
    if (type === "video") return <span className="text-xs font-bold" style={{ color: theme.brand }}>视频</span>;
    return <FileText className="w-4 h-4" style={{ color: theme.brand }} />;
  }

  function fmtSize(bytes: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.line }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: theme.brandLight, borderBottom: `1px solid ${theme.line}` }}>
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold" style={{ color: theme.textMain }}>素材库</div>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.brand, color: '#fff' }}>{materials.length}</span>
        </div>
        <div>
          <input ref={matFileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.docx,.xlsx,.pptx,.txt" onChange={handleFileSelect} />
          <div
            onClick={() => matFileRef.current?.click()}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: theme.brand, cursor: 'pointer', fontSize: 11, color: '#fff', fontWeight: 600, userSelect: 'none' as const }}
          >+</div>
        </div>
      </div>
      <div className="px-4 py-2.5" style={{ backgroundColor: '#FAFBFF', borderBottom: `1px solid ${theme.line}` }}>
        <p className="text-xs leading-relaxed" style={{ color: theme.textSub }}>
          上传图片、视频、文件，并用自然语言描述「什么时候发这个」。AI 对话时会自动判断并发送对应素材给客户。
        </p>
      </div>
      <div style={{ backgroundColor: theme.white }}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.brand }} /></div>
        ) : materials.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: theme.textSub }}>暂无素材，点击右上角 + 上传</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: theme.line }}>
            {materials.map((mat) => (
              <li key={mat.id} className="px-4 py-3">
                {editingId === mat.id ? (
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs mb-1" style={{ color: theme.textSub }}>名称</div>
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full text-sm rounded-lg border px-3 py-1.5 outline-none" style={{ borderColor: theme.brand }} autoFocus />
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: theme.textSub }}>触发描述（告诉 AI 什么时候发这个）</div>
                      <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} placeholder="例：当客户询问如何订购、怎么下单时，发送这张扫码订购二维码海报" className="w-full text-sm rounded-lg border px-3 py-2 resize-none outline-none" style={{ borderColor: theme.line }} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: theme.line, color: theme.textSub }}>取消</button>
                      <button onClick={() => handleSaveEdit(mat.id)} disabled={savingEdit} className="text-xs px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-60" style={{ backgroundColor: theme.brand }}>
                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: theme.brandLight }}>
                      {mat.type === "image" && mat.storage_url ? (
                        <img src={mat.storage_url} alt={mat.title} className="w-full h-full object-cover" />
                      ) : (
                        getTypeIcon(mat.type)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: theme.textMain }}>{mat.title}</div>
                      {mat.description ? (
                        <div className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.textSub }}>{mat.description}</div>
                      ) : (
                        <div className="text-xs mt-0.5 italic" style={{ color: '#D1D5DB' }}>未设置触发描述（AI 不会自动发送）</div>
                      )}
                      <div className="text-xs mt-1" style={{ color: '#D1D5DB' }}>{fmtSize(mat.file_size)}</div>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => { setEditingId(mat.id); setEditTitle(mat.title); setEditDesc(mat.description || ""); }} className="text-xs border rounded-lg px-2 py-1" style={{ borderColor: theme.line, color: theme.textSub }}>编辑</button>
                      {deleteConfirm === mat.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(mat.id)} className="text-xs text-white bg-red-500 rounded-lg px-2 py-1">确删</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-xs border rounded-lg px-2 py-1" style={{ borderColor: theme.line, color: theme.textSub }}>取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(mat.id)} className="p-1.5 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => { if (!uploading) { setShowUploadModal(false); setUploadFile(null); setUploadPreview(null); } }}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: theme.textMain }}>上传素材</span>
              <button onClick={() => { if (!uploading) { setShowUploadModal(false); setUploadFile(null); setUploadPreview(null); } }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {uploadPreview && (
              <div className="w-full h-40 rounded-xl overflow-hidden" style={{ backgroundColor: theme.brandLight }}>
                <img src={uploadPreview} alt="预览" className="w-full h-full object-contain" />
              </div>
            )}
            {!uploadPreview && uploadFile && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: theme.brandLight }}>
                <FileText className="w-5 h-5" style={{ color: theme.brand }} />
                <span className="text-sm truncate" style={{ color: theme.textMain }}>{uploadFile.name}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSub }}>素材名称</label>
              <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="w-full text-sm rounded-xl border p-3 outline-none" style={{ borderColor: theme.line }} placeholder="为这个素材起个名字" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSub }}>触发描述（告诉 AI 什么时候发这个）</label>
              <textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} rows={3} placeholder="例：当客户询问如何订购、怎么下单、购买流程时，发送这张扫码订购二维码海报" className="w-full text-sm rounded-xl border p-3 resize-none outline-none" style={{ borderColor: theme.line }} />
              <p className="text-xs mt-1" style={{ color: theme.textSub }}>建议写具体场景，越具体 AI 判断越准确</p>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: theme.brand }}
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />上传中...</> : <><Upload className="w-4 h-4" />确认上传</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ProjectAIBrainTab - 「知识库」Tab（AI 大脑）
// ═══════════════════════════════════════════════════════════════
export function ProjectAIBrainTab({
  refreshKey = 0,
  channelId = DEFAULT_CHANNEL_ID,
  channelType = DEFAULT_CHANNEL_TYPE,
  theme = YABAN_THEME,
  hideDigitalTwin = true,
}: {
  refreshKey?: number;
  channelId?: number;
  channelType?: string;
  theme?: typeof YABAN_THEME;
  hideDigitalTwin?: boolean;
} = {}) {
  // ── 第0步：AI智能整理 ──
  const [step0Open, setStep0Open] = useState(false);
  const [step0HelpOpen, setStep0HelpOpen] = useState(false);
  const [step0Input, setStep0Input] = useState("");
  const [step0Extra, setStep0Extra] = useState("");
  const [step0Analyzing, setStep0Analyzing] = useState(false);
  const [step0Result, setStep0Result] = useState<{ prompt_additions: { content: string; duplicate_check: string }[]; kb_items: { question: string; answer: string; duplicate_check: string }[]; summary: string; dup_summary?: string } | null>(null);
  const [step0SelPrompts, setStep0SelPrompts] = useState<boolean[]>([]);
  const [step0SelKbs, setStep0SelKbs] = useState<boolean[]>([]);
  const [step0Applying, setStep0Applying] = useState(false);
  const [step0Done, setStep0Done] = useState(false);
  const [step0EditPromptIdx, setStep0EditPromptIdx] = useState<number | null>(null);
  const [step0EditKbIdx, setStep0EditKbIdx] = useState<number | null>(null);
  const [step0EditDraftPrompt, setStep0EditDraftPrompt] = useState("");
  const [step0EditDraftQ, setStep0EditDraftQ] = useState("");
  const [step0EditDraftA, setStep0EditDraftA] = useState("");
  const [step0OcrLoading, setStep0OcrLoading] = useState(false);
  const [step0ImagePreview, setStep0ImagePreview] = useState<string | null>(null);
  const step0FileRef = useRef<HTMLInputElement>(null);
  const [step0EmailPopup, setStep0EmailPopup] = useState(false);
  const [step0EmailCopied, setStep0EmailCopied] = useState(false);
  const INBOX_EMAIL = `nutrition@mail.jiangyuchen.cn`;
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [showKbDrawer, setShowKbDrawer] = useState(false);
  const [kbSources, setKbSources] = useState<any[]>([]);
  const [loadingKbSources, setLoadingKbSources] = useState(false);
  const [showSysKbDrawer, setShowSysKbDrawer] = useState(false);
  const [sysKbSources, setSysKbSources] = useState<any[]>([]);
  const [sysKbExpandedSource, setSysKbExpandedSource] = useState<string | null>(null);
  const [sysKbItems, setSysKbItems] = useState<Record<string, any[]>>({});
  const [kbExpandedSource, setKbExpandedSource] = useState<string | null>(null);
  const [kbItems, setKbItems] = useState<Record<string, any[]>>({});

  const [step0FileLoading, setStep0FileLoading] = useState(false);
  const [step0UploadedFile, setStep0UploadedFile] = useState<string | null>(null);
  const step0DocRef = useRef<HTMLInputElement>(null);

  // ── 第①层：AI 指令 ──
  const [promptRules, setPromptRules] = useState<PromptRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loadingRules, setLoadingRules] = useState(true);
  const [platformRules, setPlatformRules] = useState<PromptRule[]>([]);
  const [loadingPlatformRules, setLoadingPlatformRules] = useState(true);
  const [platformRulesEnabled, setPlatformRulesEnabled] = useState(true);
  const [togglingPlatformRules, setTogglingPlatformRules] = useState(false);

  // ── 第③层：知识库统计 ──
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
  const [refreshing, setRefreshing] = useState(false);

  // 平台规则详情弹窗
  const [platformRuleDetail, setPlatformRuleDetail] = useState<{ rule_text: string } | null>(null);
  const [platformRulesExpanded, setPlatformRulesExpanded] = useState(false);

  async function handleStep0OcrImage(file: File) {
    setStep0OcrLoading(true);
    setStep0ImagePreview(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setStep0ImagePreview(URL.createObjectURL(file));
      const resp = await fetch('/api/wecom/ocr-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }),
      });
      const data = await resp.json();
      if (data.ok && data.text) {
        setStep0Input(prev => prev ? prev + '\n\n' + data.text : data.text);
        setStep0ImagePreview(null);
        toast.success('图片识别完成，内容已填入输入框');
      } else {
        toast.error(data.error || '图片识别失败');
        setStep0ImagePreview(null);
      }
    } catch (e) {
      toast.error('图片上传失败，请重试');
      setStep0ImagePreview(null);
    } finally {
      setStep0OcrLoading(false);
      if (step0FileRef.current) step0FileRef.current.value = '';
    }
  }

  async function handleStep0FileUpload(file: File) {
    setStep0FileLoading(true);
    setStep0UploadedFile(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/extract-file', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.ok && data.text) {
        setStep0Input(prev => prev ? prev + '\n\n' + data.text : data.text);
        setStep0UploadedFile(file.name);
        toast.success(`「${file.name}」内容已提取，已填入输入框`);
      } else {
        toast.error(data.error || '文件解析失败');
      }
    } catch (e) {
      toast.error('文件上传失败，请重试');
    } finally {
      setStep0FileLoading(false);
      if (step0DocRef.current) step0DocRef.current.value = '';
    }
  }

  async function handleStep0Analyze() {
    if (!step0Input.trim() && !step0Extra.trim()) return;
    setStep0Analyzing(true);
    setStep0Result(null);
    setStep0Done(false);
    try {
      let combinedText = step0Input.trim();
      if (step0Extra.trim()) {
        combinedText = combinedText
          ? `${combinedText}\n\n---\n【我的需求/补充说明】\n${step0Extra.trim()}`
          : step0Extra.trim();
      }
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, channelId: channelId, kbId: 0 }),
      });
      const d = await res.json();
      if (d.ok) {
        const normalizedPrompts = (d.prompt_additions || []).map((p: any) =>
          typeof p === 'string' ? { content: p, duplicate_check: 'new' } : p
        );
        const normalizedKbs = (d.kb_items || []).map((k: any) =>
          typeof k === 'object' && k !== null ? k : { question: String(k), answer: '', duplicate_check: 'new' }
        );
        setStep0Result({ ...d, prompt_additions: normalizedPrompts, kb_items: normalizedKbs });
        setStep0SelPrompts(normalizedPrompts.map(() => true));
        setStep0SelKbs(normalizedKbs.map(() => true));
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
      const chosenPrompts = step0Result.prompt_additions.filter((_, i) => step0SelPrompts[i]).map(p => p.content);
      const chosenKbs = step0Result.kb_items.filter((_, i) => step0SelKbs[i]);
      let promptSuccess = 0;
      let kbSuccess = 0;
      if (chosenPrompts.length > 0) {
        for (const p of chosenPrompts) {
          try {
            const r = await fetch(`/api/wecom/channels/${channelId}/prompt-rules`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ layer: 2, category: "行为规则", content: p }),
            });
            const rd = await r.json();
            if (rd.rule) promptSuccess++;
          } catch {}
        }
      }
      if (chosenKbs.length > 0) {
        for (const item of chosenKbs) {
          try {
            const r = await fetch("/api/wecom/ch/kb/adopt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channel_id: channelId, channel_type: channelType, question: item.question, answer: item.answer }),
            });
            const rd = await r.json();
            if (rd.ok) kbSuccess++;
          } catch {}
        }
      }
      const msgs: string[] = [];
      if (chosenPrompts.length > 0) msgs.push(`${promptSuccess}/${chosenPrompts.length}条指令已写入角色/行为规则`);
      if (chosenKbs.length > 0) msgs.push(`${kbSuccess}/${chosenKbs.length}条已写入知识库`);
      if (msgs.length > 0) toast.success(msgs.join("；"));
      setStep0Done(true);
      loadAllData();
      setTimeout(() => { setStep0Result(null); setStep0Input(""); setStep0Extra(""); setStep0Done(false); }, 1500);
    } catch {
      toast.error("写入失败");
    } finally {
      setStep0Applying(false);
    }
  }

  async function loadAllData() {
    setRefreshing(true);
    fetch(`/api/wecom/channels/${channelId}/prompt-rules`)
      .then(r => r.json())
      .then(d => {
        const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d) ? d : [];
        setPromptRules(rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      })
      .finally(() => setLoadingRules(false));

    // 加载该渠道授权的共享库（知识库 + 指令库）
    const grantsData = await fetch(`/api/wecom/channel-grants?channel_id=${channelId}`)
      .then(r => r.json())
      .catch(() => ({ ok: false, kb_grants: [], rule_grants: [] }));

    // 根据授权的共享指令库，加载对应的指令内容
    if (grantsData.ok && Array.isArray(grantsData.rule_grants) && grantsData.rule_grants.length > 0) {
      const enabledRuleLibIds = grantsData.rule_grants
        .filter((g: any) => g.enabled)
        .map((g: any) => g.shared_rule_lib_id);
      if (enabledRuleLibIds.length > 0) {
        const allRules: any[] = [];
        for (const libId of enabledRuleLibIds) {
          try {
            const r = await fetch(`/api/wecom/shared-rule-libs/${libId}/rules`).then(res => res.json());
            if (r.ok && Array.isArray(r.rules)) {
              allRules.push(...r.rules);
            }
          } catch {}
        }
        setPlatformRules(allRules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      } else {
        setPlatformRules([]);
      }
    } else {
      // 如果没有绑定诊所，尝试读取默认平台指令（兴容旧逻辑）
      fetch(`/api/wecom/channels/${PLATFORM_PROMPT_CHANNEL_ID}/prompt-rules`)
        .then(r => r.json())
        .then(d => {
          const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d) ? d : [];
          setPlatformRules(rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
        })
        .catch(() => setPlatformRules([]));
    }
    setLoadingPlatformRules(false);

    // 根据授权的共享知识库，构建共享知识库的统计查询参数
    const enabledKbIds = grantsData.ok && Array.isArray(grantsData.kb_grants)
      ? grantsData.kb_grants.filter((g: any) => g.enabled).map((g: any) => g.shared_kb_id)
      : [];

    await Promise.all([
      fetch(`/api/wecom/ch/kb/stats?channel_id=${channelId}`).then(r => r.json()),
      enabledKbIds.length > 0
        ? fetch(`/api/wecom/ch/kb/stats?kb_ids=${enabledKbIds.join(',')}`).then(r => r.json())
        : Promise.resolve({ ok: true, item_count: 0, file_count: 0, char_count: 0 }),
      fetch(`/api/wecom/channel-config/${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/channels/${channelId}/config`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/knowledge-bases`).then(r => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/wecom/ch/kb/sources?channel_id=${channelId}`).then(r => r.json()).catch(() => ({ ok: false })),
      enabledKbIds.length > 0
        ? fetch(`/api/wecom/ch/kb/sources?kb_ids=${enabledKbIds.join(',')}`).then(r => r.json()).catch(() => ({ ok: false }))
        : Promise.resolve({ ok: true, sources: [] }),
    ]).then(([priv, sys, chCfg, cfg, kbs, src, sysSrc]) => {
      if (priv.ok) setKbStats({ item_count: priv.item_count || 0, file_count: priv.file_count || 0, char_count: priv.char_count || 0, month_count: priv.month_count || 0 });
      if (sys.ok) setSysKbStats({ item_count: sys.item_count || 0, file_count: sys.file_count || 0, char_count: sys.char_count || 0 });
      setSysKbEnabled(chCfg.disable_system_kb !== '1');
      setPlatformRulesEnabled(chCfg.disable_platform_rules !== '1');
      if (cfg.config) {
        setContextRounds(cfg.config.context_rounds || 10);
        setSystemPrompt(cfg.config.system_prompt || "");
        setKbId(cfg.config.knowledge_base_id || 0);
        if (cfg.config.ai_model) setAiModel(cfg.config.ai_model);
      }
      if (kbs.ok && Array.isArray(kbs.kbs)) setKbList(kbs.kbs);
      if (src.ok && Array.isArray(src.sources)) setKbSources(src.sources);
      if (sysSrc.ok && Array.isArray(sysSrc.sources)) setSysKbSources(sysSrc.sources);
    }).finally(() => setRefreshing(false));
  }

  useEffect(() => { loadAllData(); }, [refreshKey]);

  const platformLayer1Rules = platformRules;
  const layer2Rules = promptRules.filter(r => r.layer === 2);

  async function handleSaveRule(rule: PromptRule) {
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${channelId}/prompt-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editingRuleText }) });
      const d = await res.json();
      if (d.ok || d.rule) { toast.success("已保存"); setEditingRuleId(null); setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_text: editingRuleText, content: editingRuleText } : r)); }
      else toast.error(d.error || "保存失败");
    } catch { toast.error("保存失败"); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(rule: PromptRule) {
    try {
      const res = await fetch(`/api/wecom/channels/${channelId}/prompt-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: rule.enabled ? 0 : 1 }) });
      const d = await res.json();
      if (d.ok || d.rule) setPromptRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      else toast.error(d.error || "操作失败");
    } catch { toast.error("操作失败"); }
  }

  async function handleAddRule() {
    if (!newRuleText.trim()) { toast.error("请输入指令内容"); return; }
    setSavingRule(true);
    try {
      const res = await fetch(`/api/wecom/channels/${channelId}/prompt-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layer: 2, category: "custom", content: newRuleText, enabled: 1, sort_order: 1 }) });
      const d = await res.json();
      if (d.rule) {
        toast.success("添加成功"); setAddingRule(false); setNewRuleText("");
        const rulesRes = await fetch(`/api/wecom/channels/${channelId}/prompt-rules`);
        const rulesData = await rulesRes.json();
        if (Array.isArray(rulesData.rules)) setPromptRules(rulesData.rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
        else if (Array.isArray(rulesData)) setPromptRules(rulesData.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      } else toast.error(d.error || "添加失败");
    } catch { toast.error("添加失败"); }
    finally { setSavingRule(false); }
  }

  async function handleDeleteRule(id: number) {
    try {
      const res = await fetch(`/api/wecom/channels/${channelId}/prompt-rules/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success("已删除"); setPromptRules(prev => prev.filter(r => r.id !== id)); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function handleToggleSysKb() {
    setTogglingKb(true);
    try {
      const newVal = !sysKbEnabled;
      const res = await fetch(`/api/wecom/channel-config/${channelId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disable_system_kb: newVal ? '0' : '1' }) });
      const d = await res.json();
      if (d.ok) { setSysKbEnabled(newVal); toast.success(newVal ? '共享知识库已启用' : '共享知识库已禁用'); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setTogglingKb(false); }
  }

  async function handleTogglePlatformRules() {
    setTogglingPlatformRules(true);
    try {
      const newVal = !platformRulesEnabled;
      const res = await fetch(`/api/wecom/channel-config/${channelId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disable_platform_rules: newVal ? '0' : '1' }) });
      const d = await res.json();
      if (d.ok) { setPlatformRulesEnabled(newVal); toast.success(newVal ? '平台共享指令已启用' : '平台共享指令已禁用'); }
      else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setTogglingPlatformRules(false); }
  }

  async function handleSaveContextRounds() {
    setSavingCtx(true);
    try {
      const res = await fetch(`/api/wecom/channel-config/${channelId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context_rounds: contextRounds }) });
      const d = await res.json();
      if (d.ok) { setCtxSaved(true); toast.success('已保存'); setTimeout(() => setCtxSaved(false), 2000); }
      else toast.error(d.error || '保存失败');
    } catch { toast.error('网络错误'); }
    finally { setSavingCtx(false); }
  }

  // 层级配置（根据 hideDigitalTwin 决定是否包含第②层）
  const allLayers = [
    {
      id: 1,
      label: '角色定义 & 行为规则',
      subtitle: 'AI 的基础人设与规则',
      badge: loadingRules || loadingPlatformRules ? '-' : `${platformLayer1Rules.length + layer2Rules.length} 条`,
    },
    {
      id: 2,
      label: '我的数字分身',
      subtitle: '客服本人的风格克隆',
      badge: null,
    },
    {
      id: 3,
      label: '知识库',
      subtitle: '标准答案库（共享 + 私人）',
      badge: `${kbStats.item_count + sysKbStats.item_count} 条`,
    },
    {
      id: 4,
      label: '历史对话记忆',
      subtitle: 'AI 对客户的理解',
      badge: `${contextRounds} 轮`,
    },
  ];

  const layers = hideDigitalTwin ? allLayers.filter(l => l.id !== 2) : allLayers;

  return (
    <div className="space-y-3 pb-8 pt-2">
      {/* 第0步：AI智能整理 */}
      <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: theme.line }}>
        <div className="w-full px-4 py-3 flex items-center justify-between" style={{ backgroundColor: theme.brandLight }}>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setStep0Open(v => !v)} className="text-sm font-bold" style={{ color: theme.brand }}>AI 智能整理</button>
            <button
              onClick={e => { e.stopPropagation(); setStep0HelpOpen(true); }}
              className="flex items-center justify-center"
              style={{ color: theme.textMain, opacity: 0.6 }}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setStep0Open(v => !v)}>
            <ChevronRight className={`w-4 h-4 transition-transform ${step0Open ? 'rotate-90' : ''}`} style={{ color: theme.brand, opacity: 0.7 }} />
          </button>
        </div>

        {step0HelpOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setStep0HelpOpen(false)}>
            <div className="w-full max-w-lg rounded-t-2xl bg-white px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-base font-bold" style={{ color: theme.textMain }}>为什么要有「AI 智能整理」？</span>
                <button onClick={() => setStep0HelpOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
                  <X className="w-4 h-4" style={{ color: theme.textSub }} />
                </button>
              </div>
              <div className="space-y-3 text-sm leading-relaxed" style={{ color: theme.textMain }}>
                <p>一个优秀的 AI 分身，需要三类信息共同支撑：</p>
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: theme.brandLight }}>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>角色定义</span>
                    <span style={{ color: theme.textSub }}>—— AI 是谁？性格怎样？说话风格是什么？</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>行为规则</span>
                    <span style={{ color: theme.textSub }}>—— 遇到哪些情况该怎么做？什么不能说？</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>知识库</span>
                    <span style={{ color: theme.textSub }}>—— 产品价格、常见问题、专业知识等具体信息</span>
                  </div>
                </div>
                <p style={{ color: theme.textSub }}>大多数人并不知道自己输入的内容属于哪一类。<span className="font-medium" style={{ color: theme.textMain }}>这个功能就是解决这个问题的</span>——你只需要把想说的内容粘贴进来，AI 会自动判断并分类写入对应的位置。</p>
              </div>
            </div>
          </div>
        )}

        {step0Open && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${theme.line}` }}>
            <div className="relative rounded-lg overflow-hidden mt-3" style={{ border: `1px solid ${theme.textMain}`, backgroundColor: '#fff' }}>
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <span className="text-xs" style={{ color: step0Input.length > 0 ? 'transparent' : theme.textSub }}>请输入内容...</span>
                <span className="text-xs" style={{ color: step0Input.length > 0 ? theme.brand : theme.textSub }}>{step0Input.length} 字</span>
              </div>
              <textarea
                value={step0Input}
                onChange={e => {
                  setStep0Input(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onFocus={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                placeholder=""
                rows={3}
                className="w-full text-base px-3 pb-2 resize-none focus:outline-none overflow-hidden bg-transparent"
                style={{ color: theme.textMain, minHeight: '72px', border: 'none', outline: 'none' }}
              />
              <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                <input
                  ref={step0FileRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.type.startsWith('image/')) {
                      handleStep0OcrImage(file);
                    } else {
                      handleStep0FileUpload(file);
                    }
                  }}
                />
                <button
                  onClick={() => step0FileRef.current?.click()}
                  disabled={step0OcrLoading || step0FileLoading}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border disabled:opacity-50 transition-all"
                  style={{ color: theme.textSub, borderColor: theme.line, backgroundColor: theme.bg }}
                >
                  {(step0OcrLoading || step0FileLoading)
                    ? <><Loader2 className="w-3 h-3 animate-spin" />识别中...</>
                    : <><Camera className="w-3 h-3" />拍照 / 上传图片 / 文件</>}
                </button>
                {step0ImagePreview && (
                  <div className="relative flex-shrink-0">
                    <img src={step0ImagePreview} alt="已上传" className="h-7 w-7 object-cover rounded" />
                    <button onClick={() => setStep0ImagePreview(null)} className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.textSub, color: '#fff' }}>
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                )}
                {step0UploadedFile && (
                  <span className="text-xs truncate max-w-[120px]" style={{ color: theme.brand }}>{step0UploadedFile}</span>
                )}
                <button
                  onClick={() => setStep0EmailPopup(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all"
                  style={{ color: step0EmailPopup ? theme.brand : theme.textSub, borderColor: step0EmailPopup ? theme.brand : theme.line, backgroundColor: theme.bg }}
                >
                  <Mail className="w-3 h-3" />邮件
                </button>
              </div>

              {step0EmailPopup && (
                <div className="mx-3 mb-3 rounded-xl p-3" style={{ backgroundColor: theme.brandLight, border: `1px solid ${theme.brand}30` }}>
                  <p className="text-xs mb-2" style={{ color: theme.brandDeep }}>转发你的邮件至以下地址，AI 会帮你处理下一步。</p>
                  <div
                    className="relative flex items-center px-2.5 py-1.5 rounded-lg cursor-pointer select-all"
                    style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}
                    onClick={() => {
                      navigator.clipboard.writeText(INBOX_EMAIL).then(() => {
                        setStep0EmailCopied(true);
                        setTimeout(() => setStep0EmailCopied(false), 2000);
                      });
                    }}
                  >
                    <span className="flex-1 text-xs font-mono" style={{ color: theme.textMain }}>{INBOX_EMAIL}</span>
                    <span className="ml-2 flex-shrink-0" style={{ color: step0EmailCopied ? theme.brand : theme.textSub }}>
                      {step0EmailCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: theme.textSub }}>支持正文及附件（PDF、Word、图片等）</p>
                </div>
              )}
            </div>

            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${theme.line}`, backgroundColor: '#fff' }}>
              <div className="flex items-center justify-between px-3 pt-2 pb-0.5">
                <span className="text-xs" style={{ color: theme.textSub }}>补充说明（可选）</span>
                <span className="text-xs" style={{ color: step0Extra.length > 0 ? theme.brand : theme.textSub }}>{step0Extra.length} 字</span>
              </div>
              <textarea
                value={step0Extra}
                onChange={e => setStep0Extra(e.target.value)}
                placeholder="例如：帮我整理成客户常问的问答格式，重点提取退款政策..."
                rows={2}
                className="w-full text-sm px-3 pb-2.5 resize-none focus:outline-none bg-transparent"
                style={{ color: theme.textMain, border: 'none', outline: 'none', minHeight: '52px' }}
              />
            </div>

            <button
              onClick={handleStep0Analyze}
              disabled={step0Analyzing || (!step0Input.trim() && !step0Extra.trim())}
              className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: theme.brand, color: '#fff' }}
            >
              {step0Analyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" />分析中...</>
                : <>AI 助理</>}
            </button>

            {step0Result && (
              <div className="space-y-3">
                {step0Result.summary && (
                  <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ color: theme.brandDeep, backgroundColor: theme.brandLight }}>
                    <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{step0Result.summary}</span>
                  </div>
                )}
                {step0Result.dup_summary && (
                  <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-1.5" style={{
                    color: step0Result.dup_summary.startsWith('⚠') ? '#DC2626' : step0Result.dup_summary.startsWith('~') ? '#D97706' : '#059669',
                    backgroundColor: step0Result.dup_summary.startsWith('⚠') ? '#FEF2F2' : step0Result.dup_summary.startsWith('~') ? '#FFFBEB' : '#F0FDF4'
                  }}>
                    <span>{step0Result.dup_summary}</span>
                  </div>
                )}

                {step0Result.prompt_additions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold flex items-center gap-1" style={{ color: theme.textSub }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.brand }} />
                      建议写入「角色/行为规则」
                    </div>
                    {step0Result.prompt_additions.map((p, i) => (
                      <div key={i} className="rounded-lg border transition-all" style={step0SelPrompts[i] ? { borderColor: theme.brand, backgroundColor: theme.brandLight } : { borderColor: theme.line, backgroundColor: theme.white }}>
                        {step0EditPromptIdx === i ? (
                          <div className="p-2 space-y-2">
                            <textarea value={step0EditDraftPrompt} onChange={e => setStep0EditDraftPrompt(e.target.value)} rows={3} autoFocus className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none" style={{ border: `1px solid ${theme.brand}` }} />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditPromptIdx(null)} className="text-xs px-2 py-0.5 rounded" style={{ color: theme.textSub }}>取消</button>
                              <button onClick={() => { const u=[...step0Result!.prompt_additions]; u[i]={...u[i], content: step0EditDraftPrompt}; setStep0Result({...step0Result!, prompt_additions: u}); setStep0EditPromptIdx(null); }} className="text-xs px-2 py-0.5 rounded" style={{ color: theme.brand }}>保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className="w-4 h-4 rounded border flex items-center justify-center" style={step0SelPrompts[i] ? { backgroundColor: theme.brand, borderColor: theme.brand } : { borderColor: theme.line }}>
                                {step0SelPrompts[i] && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <div className="flex-1 text-xs">
                              {p.duplicate_check && p.duplicate_check !== 'new' && (
                                <div className="mb-1 px-1.5 py-0.5 rounded text-xs inline-flex items-center gap-1" style={{ backgroundColor: p.duplicate_check.startsWith('duplicate') ? '#FEF2F2' : '#FFFBEB', color: p.duplicate_check.startsWith('duplicate') ? '#DC2626' : '#D97706' }}>
                                  {p.duplicate_check.startsWith('duplicate') ? '⚠ 重复' : '~ 相似'}：{p.duplicate_check.replace(/^(duplicate|similar):/, '').split(',')[0]}
                                </div>
                              )}
                              <span className="whitespace-pre-wrap" style={{ color: step0SelPrompts[i] ? theme.brandDeep : theme.textSub }}>{p.content}</span>
                            </div>
                            <button onClick={() => { setStep0EditPromptIdx(i); setStep0EditDraftPrompt(p.content); }} className="flex-shrink-0" style={{ color: theme.line }}>
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {step0Result.kb_items.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold flex items-center gap-1" style={{ color: theme.textSub }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.brand }} />
                      建议写入「知识库」
                    </div>
                    {step0Result.kb_items.map((item, i) => (
                      <div key={i} className="rounded-lg border transition-all" style={step0SelKbs[i] ? { borderColor: theme.brand, backgroundColor: theme.brandLight } : { borderColor: theme.line, backgroundColor: theme.white }}>
                        {step0EditKbIdx === i ? (
                          <div className="p-2 space-y-2">
                            <div>
                              <div className="text-xs mb-0.5" style={{ color: theme.textSub }}>Q 问题</div>
                              <input value={step0EditDraftQ} onChange={e => setStep0EditDraftQ(e.target.value)} autoFocus className="w-full text-xs rounded px-2 py-1 focus:outline-none" style={{ border: `1px solid ${theme.brand}` }} />
                            </div>
                            <div>
                              <div className="text-xs mb-0.5" style={{ color: theme.textSub }}>A 答案</div>
                              <textarea value={step0EditDraftA} onChange={e => setStep0EditDraftA(e.target.value)} rows={3} className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none" style={{ border: `1px solid ${theme.brand}` }} />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditKbIdx(null)} className="text-xs px-2 py-0.5 rounded" style={{ color: theme.textSub }}>取消</button>
                              <button onClick={() => { const u=[...step0Result!.kb_items]; u[i]={question:step0EditDraftQ,answer:step0EditDraftA, duplicate_check: u[i].duplicate_check}; setStep0Result({...step0Result!, kb_items: u}); setStep0EditKbIdx(null); }} className="text-xs px-2 py-0.5 rounded" style={{ color: theme.brand }}>保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className="w-4 h-4 rounded border flex items-center justify-center" style={step0SelKbs[i] ? { backgroundColor: theme.brand, borderColor: theme.brand } : { borderColor: theme.line }}>
                                {step0SelKbs[i] && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <div className="flex-1 text-xs">
                              {item.duplicate_check && item.duplicate_check !== 'new' && (
                                <div className="mb-1 px-1.5 py-0.5 rounded text-xs inline-flex items-center gap-1" style={{ backgroundColor: item.duplicate_check.startsWith('duplicate') ? '#FEF2F2' : '#FFFBEB', color: item.duplicate_check.startsWith('duplicate') ? '#DC2626' : '#D97706' }}>
                                  {item.duplicate_check.startsWith('duplicate') ? '⚠ 重复' : '~ 相似'}：{item.duplicate_check.replace(/^(duplicate|similar):/, '').split(',')[0]}
                                </div>
                              )}
                              <div className="font-medium" style={{ color: step0SelKbs[i] ? theme.brandDeep : theme.textMain }}>Q: {item.question}</div>
                              <div className="mt-0.5" style={{ color: step0SelKbs[i] ? theme.brand : theme.textSub }}>A: {item.answer}</div>
                            </div>
                            <button onClick={() => { setStep0EditKbIdx(i); setStep0EditDraftQ(item.question); setStep0EditDraftA(item.answer); }} className="flex-shrink-0" style={{ color: theme.line }}>
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
                    className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ backgroundColor: step0Done ? theme.brand : theme.textMain, color: '#fff' }}
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

      {/* 4 层卡片（隐藏数字分身层） */}
      {layers.map(layer => (
        <div key={layer.id} className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: theme.line }}>
          <div className="w-full px-4 py-3 flex items-center justify-between" style={{ backgroundColor: theme.brandLight }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: theme.brand }}>{layer.label}</span>
              {layer.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: theme.brand }}>
                  {layer.badge}
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: theme.brand, opacity: 0.7 }}>{layer.subtitle}</span>
          </div>

          <div className="px-4 pb-4 pt-3 bg-white space-y-3" style={{ borderTop: `1px solid ${theme.line}` }}>

            {/* ── 第①层内容：AI 指令管理 ── */}
            {layer.id === 1 && (
              <div className="space-y-3">
                {/* 平台共享指令 */}
                <div className="rounded-xl border p-3" style={{ borderColor: theme.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm font-semibold" style={{ color: theme.textMain }}>共享</span>
                      <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>
                        {loadingPlatformRules ? '加载中...' : `${platformLayer1Rules.length} 条`}
                      </span>
                    </div>
                    <div
                      onClick={togglingPlatformRules ? undefined : handleTogglePlatformRules}
                      style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: platformRulesEnabled ? theme.brand : '#D1D5DB', cursor: togglingPlatformRules ? 'not-allowed' : 'pointer', opacity: togglingPlatformRules ? 0.5 : 1, flexShrink: 0, transition: 'background-color 0.2s' }}
                    >
                      <div style={{ position: 'absolute', top: 3, left: platformRulesEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                  {platformRulesEnabled && (
                    loadingPlatformRules ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.brand }} />
                      </div>
                    ) : platformLayer1Rules.length === 0 ? (
                      <div className="text-xs text-center py-3" style={{ color: theme.textSub }}>暂无平台共享指令</div>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        {platformLayer1Rules.map(rule => (
                          <div
                            key={rule.id}
                            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 ${!rule.enabled ? 'opacity-40' : ''}`}
                            style={{ backgroundColor: theme.brandLight }}
                          >
                            <span className="text-xs flex-1 truncate" style={{ color: theme.textMain }}>
                              {(rule.rule_text || '').slice(0, 24)}{(rule.rule_text || '').length > 24 ? '…' : ''}
                            </span>
                            <button onClick={() => setPlatformRuleDetail(rule)} className="text-xs flex-shrink-0 ml-2" style={{ color: theme.brand }}>详情</button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

                {/* 私人指令 */}
                <div className="rounded-xl border p-3" style={{ borderColor: theme.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: theme.textMain }}>私人</span>
                      <span className="text-xs" style={{ color: theme.textSub }}>
                        {loadingRules ? '加载中...' : `${layer2Rules.length} 条`}
                      </span>
                    </div>
                    <button
                      onClick={() => { setShowRulesDrawer(true); setEditingRuleId(null); }}
                      className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: theme.brandLight, color: theme.brand }}
                    >编辑</button>
                  </div>
                  {layer2Rules.length === 0 ? (
                    <div className="text-xs text-center py-3" style={{ color: theme.textSub }}>暂无私人规则，可通过顶部「AI 智能整理」添加</div>
                  ) : (
                    <div className="space-y-1.5">
                      {layer2Rules.slice(0, 5).map(rule => (
                        <div key={rule.id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${!rule.enabled ? 'opacity-40' : ''}`} style={{ backgroundColor: theme.brandLight }}>
                          <span className="text-xs flex-1 truncate" style={{ color: theme.textMain }}>
                            {(rule.rule_text || '').slice(0, 28)}{(rule.rule_text || '').length > 28 ? '…' : ''}
                          </span>
                        </div>
                      ))}
                      {layer2Rules.length > 5 && (
                        <button
                          onClick={() => { setShowRulesDrawer(true); setEditingRuleId(null); }}
                          className="w-full text-xs py-1.5 text-center rounded-xl"
                          style={{ color: theme.brand, backgroundColor: theme.brandLight }}
                        >查看全部 {layer2Rules.length} 条 ›</button>
                      )}
                    </div>
                  )}
                </div>

                {/* 共享规则详情弹窗 */}
                {platformRuleDetail && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setPlatformRuleDetail(null)}>
                    <div className="w-full max-w-lg rounded-t-2xl p-4 pb-10" style={{ backgroundColor: theme.white }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold" style={{ color: theme.textMain }}>规则详情</span>
                        <button onClick={() => setPlatformRuleDetail(null)} className="text-xs px-3 py-1 rounded-lg" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>关闭</button>
                      </div>
                      <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: theme.brandLight, color: theme.textMain }}>
                        {platformRuleDetail.rule_text}
                      </div>
                    </div>
                  </div>
                )}

                {/* 私人规则管理抽屉 */}
                {showRulesDrawer && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowRulesDrawer(false); setEditingRuleId(null); }}>
                    <div className="w-full max-w-lg rounded-t-2xl p-4 pb-10 space-y-3" style={{ backgroundColor: theme.white, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-sm font-semibold" style={{ color: theme.textMain }}>私人规则管理</span>
                        <button onClick={() => { setShowRulesDrawer(false); setEditingRuleId(null); }} className="text-xs px-3 py-1 rounded-lg" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>完成</button>
                      </div>
                      {layer2Rules.length === 0 ? (
                        <div className="text-xs text-center py-8" style={{ color: theme.textSub }}>暂无私人规则，可通过顶部「AI 智能整理」添加</div>
                      ) : (
                        layer2Rules.map(rule => (
                          <div key={rule.id} className={`rounded-xl border p-3 ${!rule.enabled ? 'opacity-50' : ''}`} style={{ borderColor: theme.line }}>
                            {editingRuleId === rule.id ? (
                              <div className="space-y-2">
                                <textarea value={editingRuleText} onChange={e => setEditingRuleText(e.target.value)} rows={4} className="w-full text-xs rounded-lg border p-2 resize-none outline-none" style={{ borderColor: theme.brand, color: theme.textMain }} autoFocus />
                                <div className="flex gap-1.5">
                                  <button onClick={() => handleSaveRule(rule)} disabled={savingRule} className="flex-1 py-1.5 rounded-lg text-xs text-white flex items-center justify-center gap-1" style={{ backgroundColor: theme.brand }}>
                                    {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}保存
                                  </button>
                                  <button onClick={() => setEditingRuleId(null)} className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: theme.line, color: theme.textSub }}>取消</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div className="flex-1 text-xs leading-relaxed" style={{ color: theme.textMain }}>{rule.rule_text}</div>
                                <div className="flex gap-1 flex-shrink-0 mt-0.5">
                                  <button onClick={() => { setEditingRuleId(rule.id); setEditingRuleText(rule.rule_text); }} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: theme.line, color: theme.textSub }}>编辑</button>
                                  <button onClick={() => handleToggleRule(rule)} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: rule.enabled ? theme.line : theme.brand, color: rule.enabled ? theme.textSub : theme.brand }}>{rule.enabled ? '停用' : '启用'}</button>
                                  <button onClick={() => handleDeleteRule(rule.id)} className="text-xs px-1.5 py-0.5 rounded border border-red-100 text-red-400">删除</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 第③层内容：知识库 ── */}
            {layer.id === 3 && (
              <div className="space-y-3">
                {/* 共享知识库 */}
                <div className="rounded-xl border p-3" style={{ borderColor: theme.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: theme.textMain }}>共享</span>
                      <span className="text-xs" style={{ color: theme.textSub }}>{sysKbStats.item_count} 条 · {sysKbStats.file_count} 个文件</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSysKbDrawer(true)}
                        className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: theme.brandLight, color: theme.brand }}
                      >编辑</button>
                      <div
                        onClick={togglingKb ? undefined : handleToggleSysKb}
                        style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, borderRadius: 11, backgroundColor: sysKbEnabled ? theme.brand : '#D1D5DB', cursor: togglingKb ? 'not-allowed' : 'pointer', opacity: togglingKb ? 0.5 : 1, flexShrink: 0, transition: 'background-color 0.2s' }}
                      >
                        <div style={{ position: 'absolute', top: 3, left: sysKbEnabled ? 19 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                  </div>
                  {sysKbSources.length === 0 ? (
                    <div className="text-xs text-center py-3" style={{ color: theme.textSub }}>暂无共享知识库内容</div>
                  ) : (
                    <div className="space-y-1.5">
                      {sysKbSources.slice(0, 5).map((s: any) => (
                        <div key={s.source_file} className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ backgroundColor: theme.brandLight }}>
                          <span className="text-xs flex-1 truncate" style={{ color: theme.textMain }}>
                            {(s.source_file || '').slice(0, 28)}{(s.source_file || '').length > 28 ? '…' : ''}
                          </span>
                          <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>{s.item_count} 条</span>
                        </div>
                      ))}
                      {sysKbSources.length > 5 && (
                        <button
                          onClick={() => setShowSysKbDrawer(true)}
                          className="w-full text-xs py-1.5 text-center rounded-xl"
                          style={{ color: theme.brand, backgroundColor: theme.brandLight }}
                        >查看全部 {sysKbSources.length} 个来源 ›</button>
                      )}
                    </div>
                  )}
                </div>

                {/* 共享知识库抽屉 */}
                {showSysKbDrawer && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowSysKbDrawer(false); setSysKbExpandedSource(null); }}>
                    <div className="w-full max-w-lg rounded-t-2xl p-4 pb-10 space-y-3" style={{ backgroundColor: theme.white, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-sm font-semibold" style={{ color: theme.textMain }}>共享知识库</span>
                        <button onClick={() => { setShowSysKbDrawer(false); setSysKbExpandedSource(null); }} className="text-xs px-3 py-1 rounded-lg" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>完成</button>
                      </div>
                      {sysKbSources.length === 0 ? (
                        <div className="text-xs text-center py-8" style={{ color: theme.textSub }}>暂无共享知识库内容</div>
                      ) : (
                        sysKbSources.map((s: any) => (
                          <div key={s.source_file} className="rounded-xl border overflow-hidden" style={{ borderColor: theme.line }}>
                            <div
                              className="flex items-center justify-between p-3 cursor-pointer"
                              onClick={async () => {
                                const src = s.source_file;
                                if (sysKbExpandedSource === src) { setSysKbExpandedSource(null); return; }
                                setSysKbExpandedSource(src);
                                if (!sysKbItems[src]) {
                                  try {
                                    const r = await fetch(`/api/wecom/ch/kb/items?channel_type=kf&source_file=${encodeURIComponent(src)}`);
                                    const d = await r.json();
                                    if (d.ok) setSysKbItems(prev => ({ ...prev, [src]: d.items || [] }));
                                  } catch {}
                                }
                              }}
                            >
                              <span className="text-xs font-medium flex-1" style={{ color: theme.textMain }}>{s.source_file}</span>
                              <span className="text-xs flex-shrink-0 ml-2" style={{ color: theme.textSub }}>{s.item_count} 条 · {formatDate(s.latest_time)}</span>
                              <span className="ml-2 text-xs" style={{ color: theme.brand }}>{sysKbExpandedSource === s.source_file ? '▲' : '▼'}</span>
                            </div>
                            {sysKbExpandedSource === s.source_file && (
                              <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: theme.line, backgroundColor: theme.bg }}>
                                {!sysKbItems[s.source_file] ? (
                                  <div className="text-xs text-center py-2" style={{ color: theme.textSub }}>加载中...</div>
                                ) : sysKbItems[s.source_file].length === 0 ? (
                                  <div className="text-xs text-center py-2" style={{ color: theme.textSub }}>暂无条目</div>
                                ) : (
                                  sysKbItems[s.source_file].map((item: any) => (
                                    <div key={item.id} className="rounded-lg p-2.5" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}>
                                      {item.question && <div className="text-xs font-medium mb-1" style={{ color: theme.textMain }}>Q: {item.question}</div>}
                                      <div className="text-xs" style={{ color: theme.textSub }}>A: {item.answer}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 私人知识库 */}
                <div className="rounded-xl border p-3" style={{ borderColor: theme.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: theme.textMain }}>私人</span>
                      <span className="text-xs" style={{ color: theme.textSub }}>{kbStats.item_count} 条 · {kbStats.file_count} 个文件 · 本月新增 {kbStats.month_count}</span>
                    </div>
                    <button
                      onClick={() => setShowKbDrawer(true)}
                      className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: theme.brandLight, color: theme.brand }}
                    >编辑</button>
                  </div>
                  {kbSources.length === 0 ? (
                    <div className="text-xs text-center py-3" style={{ color: theme.textSub }}>暂无知识库内容，可通过顶部「AI 智能整理」添加</div>
                  ) : (
                    <div className="space-y-1.5">
                      {kbSources.slice(0, 5).map((s: any) => (
                        <div key={s.source_file} className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ backgroundColor: theme.brandLight }}>
                          <span className="text-xs flex-1 truncate" style={{ color: theme.textMain }}>
                            {(s.source_file || '').slice(0, 28)}{(s.source_file || '').length > 28 ? '…' : ''}
                          </span>
                          <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>{s.item_count} 条</span>
                        </div>
                      ))}
                      {kbSources.length > 5 && (
                        <button
                          onClick={() => setShowKbDrawer(true)}
                          className="w-full text-xs py-1.5 text-center rounded-xl"
                          style={{ color: theme.brand, backgroundColor: theme.brandLight }}
                        >查看全部 {kbSources.length} 个来源 ›</button>
                      )}
                    </div>
                  )}
                </div>

                {/* 绑定知识库选择器 */}
                {kbList.length > 0 && (
                  <div className="rounded-xl border p-3" style={{ borderColor: theme.line }}>
                    <div className="text-sm font-semibold mb-2" style={{ color: theme.textMain }}>绑定知识库（选择一个私人知识库供 AI 优先检索）</div>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => { setKbId(0); setKbBindSaved(false); }}
                        className="w-full text-left text-xs px-3 py-2 rounded-xl border-2 transition-all"
                        style={kbId === 0
                          ? { borderColor: theme.textSub, backgroundColor: theme.bg, color: theme.textSub }
                          : { borderColor: theme.line, color: theme.textSub }}
                      >不绑定知识库</button>
                      {kbList.map(kb => (
                        <button
                          key={kb.id}
                          onClick={() => { setKbId(kb.id); setKbBindSaved(false); }}
                          className="w-full text-left text-xs px-3 py-2 rounded-xl border-2 transition-all"
                          style={kbId === kb.id
                            ? { borderColor: theme.brand, backgroundColor: theme.brandLight, color: theme.brandDeep }
                            : { borderColor: theme.line, color: theme.textMain }}
                        >
                          <div className="font-medium">{kb.name}</div>
                          {kb.description && <div className="mt-0.5" style={{ color: theme.textSub }}>{kb.description}</div>}
                          <div className="mt-0.5" style={{ color: theme.textSub }}>{kb.item_count} 条记录</div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setSavingKbBind(true);
                        try {
                          const res = await fetch(`/api/wecom/channels/${channelId}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: kbId }) });
                          const d = await res.json();
                          if (d.ok) { setKbBindSaved(true); toast.success('绑定已保存'); setTimeout(() => setKbBindSaved(false), 2000); }
                          else toast.error(d.error || '保存失败');
                        } catch { toast.error('保存失败'); }
                        finally { setSavingKbBind(false); }
                      }}
                      disabled={savingKbBind || kbBindSaved}
                      className="mt-2 w-full py-1.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-60"
                      style={{ backgroundColor: theme.brand }}
                    >
                      {savingKbBind ? <Loader2 className="w-3 h-3 animate-spin" /> : kbBindSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      {savingKbBind ? '保存中...' : kbBindSaved ? '已保存' : '保存绑定'}
                    </button>
                  </div>
                )}

                {/* 素材库 */}
                <MaterialsCard channelId={channelId} theme={theme} />

                {/* 私人知识库管理抽屉 */}
                {showKbDrawer && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowKbDrawer(false); setKbExpandedSource(null); }}>
                    <div className="w-full max-w-lg rounded-t-2xl p-4 pb-10 space-y-3" style={{ backgroundColor: theme.white, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-sm font-semibold" style={{ color: theme.textMain }}>私人知识库</span>
                        <button onClick={() => { setShowKbDrawer(false); setKbExpandedSource(null); }} className="text-xs px-3 py-1 rounded-lg" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>完成</button>
                      </div>
                      {kbSources.length === 0 ? (
                        <div className="text-xs text-center py-8" style={{ color: theme.textSub }}>暂无知识库内容，可通过顶部「AI 智能整理」添加</div>
                      ) : (
                        kbSources.map((s: any) => (
                          <div key={s.source_file} className="rounded-xl border overflow-hidden" style={{ borderColor: theme.line }}>
                            <div
                              className="flex items-center justify-between p-3 cursor-pointer"
                              onClick={async () => {
                                const src = s.source_file;
                                if (kbExpandedSource === src) { setKbExpandedSource(null); return; }
                                setKbExpandedSource(src);
                                if (!kbItems[src]) {
                                  try {
                                    const r = await fetch(`/api/wecom/ch/kb/items?channel_id=${channelId}&source_file=${encodeURIComponent(src)}`);
                                    const d = await r.json();
                                    if (d.ok) setKbItems(prev => ({ ...prev, [src]: d.items || [] }));
                                  } catch {}
                                }
                              }}
                            >
                              <span className="text-xs font-medium flex-1" style={{ color: theme.textMain }}>{s.source_file}</span>
                              <span className="text-xs flex-shrink-0 ml-2" style={{ color: theme.textSub }}>{s.item_count} 条 · {formatDate(s.latest_time)}</span>
                              <span className="ml-2 text-xs" style={{ color: theme.brand }}>{kbExpandedSource === s.source_file ? '▲' : '▼'}</span>
                            </div>
                            {kbExpandedSource === s.source_file && (
                              <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: theme.line, backgroundColor: theme.bg }}>
                                {!kbItems[s.source_file] ? (
                                  <div className="text-xs text-center py-2" style={{ color: theme.textSub }}>加载中...</div>
                                ) : kbItems[s.source_file].length === 0 ? (
                                  <div className="text-xs text-center py-2" style={{ color: theme.textSub }}>暂无条目</div>
                                ) : (
                                  kbItems[s.source_file].map((item: any) => (
                                    <div key={item.id} className="rounded-lg p-2.5" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}>
                                      {item.question && <div className="text-xs font-medium mb-1" style={{ color: theme.textMain }}>Q: {item.question}</div>}
                                      <div className="text-xs" style={{ color: theme.textSub }}>A: {item.answer}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 第④层内容：历史对话记忆 ── */}
            {layer.id === 4 && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold" style={{ color: theme.textMain }}>本轮上下文保留轮数</div>
                    <span className="text-sm font-bold" style={{ color: theme.brand }}>{contextRounds} 轮</span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: theme.textSub }}>AI 记忆多少轮对话历史，数值越大越消耗积分（建议 5-20）</p>
                  <input type="range" min={1} max={50} value={contextRounds} onChange={e => setContextRounds(Number(e.target.value))} className="w-full" style={{ accentColor: theme.brand }} />
                  <div className="flex justify-between text-xs mt-1" style={{ color: theme.textSub }}>
                    <span>1轮（省积分）</span><span>50轮（强记忆）</span>
                  </div>
                  <button
                    onClick={handleSaveContextRounds}
                    disabled={savingCtx || ctxSaved}
                    className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                    style={{ backgroundColor: theme.brand }}
                  >
                    {savingCtx ? <Loader2 className="w-3 h-3 animate-spin" /> : ctxSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {savingCtx ? '保存中...' : ctxSaved ? '已保存' : '保存设置'}
                  </button>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: theme.line, backgroundColor: theme.brandLight }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: theme.brand }}>客户长期偏好记忆</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.textSub }}>历史对话提炼，持久化存储客户画像</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: theme.line, color: theme.brand }}>规划中</span>
                  </div>
                </div>
                <div className="text-xs rounded-xl p-2.5" style={{ backgroundColor: theme.brandLight, color: theme.textSub, border: `1px solid ${theme.line}` }}>
                  <span className="font-medium" style={{ color: theme.brand }}>提示：</span>上下文轮数越大，AI 对本轮对话的记忆越深，但消耗积分也越多，建议根据业务场景调整。
                </div>
              </div>
            )}

          </div>
        </div>
      ))}
    </div>
  );
}
