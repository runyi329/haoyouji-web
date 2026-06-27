/**
 * ChannelKnowledgeTab — 渠道知识库 Tab（可复用于管理员端和牙伴院长端）
 *
 * Props:
 *   channelType  — 渠道类型字符串
 *   channelId    — 渠道 ID（可选）
 *   kbId         — 显式指定知识库 ID（公共库场景）
 */
import { useState, useEffect, useRef } from "react";
import {
  Loader2, Plus, ArrowLeft, Check, Pencil, Sparkles, Shield, X,
  ChevronRight,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

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

// ─── 日期格式化 ───────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function ChannelKnowledgeTab({
  channelType,
  channelId,
  kbId: explicitKbId,
}: {
  channelType: string;
  channelId?: number;
  kbId?: number;
}) {
  // 统一的库定位查询串：优先用显式 kbId（公共库场景），否则按渠道
  const kbQuery = explicitKbId
    ? `kb_id=${explicitKbId}`
    : channelId
    ? `channel_id=${channelId}`
    : `channel_type=${channelType}`;

  const [stats, setStats] = useState<{
    kb_count: number;
    item_count: number;
    file_count: number;
    char_count: number;
  }>({ kb_count: 0, item_count: 0, file_count: 0, char_count: 0 });
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<"qa" | "doc">("qa");
  const [addQuestion, setAddQuestion] = useState("");
  const [addSimilar, setAddSimilar] = useState("");
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
  const [step0EditPromptIdx, setStep0EditPromptIdx] = useState<number | null>(null);
  const [step0EditKbIdx, setStep0EditKbIdx] = useState<number | null>(null);
  const [step0EditDraftPrompt, setStep0EditDraftPrompt] = useState("");
  const [step0EditDraftQ, setStep0EditDraftQ] = useState("");
  const [step0EditDraftA, setStep0EditDraftA] = useState("");

  // 加载kbId
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
        setStep0SelPrompts((d.prompt_additions || []).map((p: PromptAddition) => p.recommendation !== "skip"));
        setStep0SelKbs((d.kb_items || []).map((k: KbItemResult) => k.recommendation !== "skip"));
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
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
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
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/export?${kbQuery}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge_${channelType}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function handleAddItem() {
    if (!addAnswer.trim()) { toast.error("请输入内容"); return; }
    setSaving(true);
    try {
      let finalQuestion = addType === "qa" ? addQuestion.trim() : null;
      if (finalQuestion && addSimilar.trim()) {
        finalQuestion += "\n" + addSimilar.trim();
      }
      const res = await fetch("/api/wecom/ch/kb/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(explicitKbId
            ? { kb_id: explicitKbId }
            : channelId
            ? { channel_id: channelId }
            : { channel_type: channelType }),
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
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSource(sourceFile: string) {
    try {
      const res = await fetch(
        `/api/wecom/ch/kb/source?${kbQuery}&source_file=${encodeURIComponent(sourceFile)}`,
        { method: "DELETE" }
      );
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteSource(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch {
      toast.error("删除失败");
    }
  }

  async function openSourceDetail(sourceFile: string) {
    setViewSource(sourceFile);
    setLoadingItems(true);
    try {
      const res = await fetch(
        `/api/wecom/ch/kb/items?${kbQuery}&source_file=${encodeURIComponent(sourceFile)}`
      );
      const d = await res.json();
      if (d.ok) setSourceItems(d.items || []);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoadingItems(false);
    }
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
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : sourceItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无内容</div>
        ) : (
          <div className="space-y-2">
            {sourceItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    item.item_type === "qa" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                  }`}>
                    {item.item_type === "qa" ? "问答" : "段落"}
                  </span>
                  {item.chunk_index != null && (
                    <span className="text-xs text-gray-400">第{item.chunk_index + 1}段</span>
                  )}
                </div>
                {item.question && (
                  <div className="text-sm font-medium text-gray-700 mb-1">Q: {item.question}</div>
                )}
                <div className="text-sm text-gray-500 line-clamp-3">
                  {item.item_type === "qa" ? "A: " : ""}{item.answer}
                </div>
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
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${step0Open ? "rotate-90" : ""}`} />
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
                placeholder="例如：客服要有耐心，不要用太官方的语气。我们的产品康宝莱F1单一99元，包含蛋白粉和维生素套餐。如果客户问价格，告诉他们具体套餐内容..."
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
                      <div className="flex items-start gap-1.5">
                        <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{step0Result.summary}</span>
                      </div>
                    )}
                    {step0Result.dup_summary && (
                      <div className="font-medium text-gray-700">{step0Result.dup_summary}</div>
                    )}
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
                        step0SelPrompts[i] ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white"
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
                            <button onClick={() => setStep0SelPrompts(prev => { const n = [...prev]; n[i] = !n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                step0SelPrompts[i] ? "bg-purple-500 border-purple-500" : "border-gray-300"
                              }`}>{step0SelPrompts[i] && <Check className="w-3 h-3 text-white" />}</div>
                            </button>
                            <div className="flex-1 min-w-0">
                              {p.action === "merge" && p.original ? (
                                <>
                                  <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                  <span className="block text-xs text-gray-400 line-through whitespace-pre-wrap">{p.original}</span>
                                  <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                  <span className={`block text-xs whitespace-pre-wrap ${step0SelPrompts[i] ? "text-purple-800 font-medium" : "text-gray-400 line-through"}`}>{p.content}</span>
                                </>
                              ) : (
                                <span className={`block text-xs whitespace-pre-wrap ${
                                  step0SelPrompts[i] ? "text-purple-800" : "text-gray-400 line-through"
                                }`}>{p.content}</span>
                              )}
                              {p.dedup_reason && (
                                <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                  p.recommendation === "skip" ? "bg-gray-100 text-gray-500" : p.action === "merge" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                                }`}>{p.recommendation === "skip" ? "⛔ " : p.action === "merge" ? "✂️ " : "✅ "}{p.dedup_reason}</div>
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
                      {!step0KbId && (
                        <span className="text-amber-500 font-normal ml-1">(请先在「配置」Tab绑定知识库)</span>
                      )}
                    </div>
                    {step0Result.kb_items.map((item, i) => (
                      <div key={i} className={`rounded-lg border transition-all ${
                        step0SelKbs[i] ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"
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
                            <button onClick={() => setStep0SelKbs(prev => { const n = [...prev]; n[i] = !n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                step0SelKbs[i] ? "bg-blue-500 border-blue-500" : "border-gray-300"
                              }`}>{step0SelKbs[i] && <Check className="w-3 h-3 text-white" />}</div>
                            </button>
                            <div className="flex-1 text-xs min-w-0">
                              {item.action === "merge" && (item.originalAnswer || item.originalQuestion) ? (
                                <>
                                  <div className="text-[10px] text-gray-400 mb-0.5">原文（重复部分已去除）：</div>
                                  <div className="text-gray-400 line-through">Q: {item.originalQuestion}</div>
                                  <div className="text-gray-400 line-through mt-0.5">A: {item.originalAnswer}</div>
                                  <div className="text-[10px] text-green-600 mt-1 mb-0.5">⤵ 仅入库这部分增量：</div>
                                  <div className={`font-medium ${step0SelKbs[i] ? "text-blue-800" : "text-gray-400 line-through"}`}>Q: {item.question}</div>
                                  <div className={`mt-0.5 ${step0SelKbs[i] ? "text-blue-600" : "text-gray-400 line-through"}`}>A: {item.answer}</div>
                                </>
                              ) : (
                                <>
                                  <div className={`font-medium ${step0SelKbs[i] ? "text-blue-800" : "text-gray-400 line-through"}`}>Q: {item.question}</div>
                                  <div className={`mt-0.5 ${step0SelKbs[i] ? "text-blue-600" : "text-gray-400 line-through"}`}>A: {item.answer}</div>
                                </>
                              )}
                              {item.dedup_reason && (
                                <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                                  item.recommendation === "skip" ? "bg-gray-100 text-gray-500" : item.action === "merge" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                                }`}>{item.recommendation === "skip" ? "⛔ " : item.action === "merge" ? "✂️ " : "✅ "}{item.dedup_reason}</div>
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
                      step0Done ? "bg-green-500 text-white" : "bg-purple-600 text-white disabled:opacity-50"
                    }`}
                  >
                    {step0Applying
                      ? <><Loader2 className="w-4 h-4 animate-spin" />写入中...</>
                      : step0Done
                      ? <><Check className="w-4 h-4" />已全部写入</>
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
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">暂无知识内容，点击「上传文件」或「手动新增」</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 px-1">知识来源（共 {sources.length} 个）</div>
          {sources.map((s, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                s.item_type === "qa" ? "bg-blue-50" : "bg-green-50"
              }`}>
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
                <input
                  value={addQuestion}
                  onChange={e => setAddQuestion(e.target.value)}
                  placeholder="输入问题（可选）"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  相似问法 <span className="text-gray-400 font-normal">（可选，多个用换行分隔）</span>
                </label>
                <Textarea
                  value={addSimilar}
                  onChange={e => setAddSimilar(e.target.value)}
                  placeholder={"例如：\n这个怎么用\n使用方法是什么"}
                  className="text-sm min-h-[80px] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  答案 <span className="text-red-400">*</span>
                </label>
                <Textarea
                  value={addAnswer}
                  onChange={e => setAddAnswer(e.target.value)}
                  placeholder="输入答案内容"
                  className="text-sm min-h-[120px] resize-none"
                />
              </div>
              <button
                onClick={handleAddItem}
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
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

export default ChannelKnowledgeTab;
