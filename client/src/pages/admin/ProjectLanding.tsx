/**
 * ProjectLanding - 子项目落地页（路由 /p/:slug）
 *
 * 当前支持的项目：
 *   proj_69hzg9 → 营养俱乐部 AI 客服管理面板
 *   其他 slug   → 占位页
 *
 * 营养俱乐部面板功能：
 *   - AI 指令（system_prompt）查看 / 编辑
 *   - 知识库管理（上传 / 手动添加 / 删除来源）
 *   - 对话日志查看
 *
 * 设计：移动端优先，绿色健康配色，lucide-react 图标，严禁 Emoji。
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  MessageSquare,
  Loader2,
  Upload,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Save,
  RefreshCw,
  FileText,
  X,
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
const KF_CHANNEL_ID = 3; // 营养俱乐部渠道 channel_id=3
const KF_CHANNEL_TYPE = "kf";

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

// ═══════════════════════════════════════════════════════════════
// AI 指令 Tab
// ═══════════════════════════════════════════════════════════════
function AiPromptTab() {
  const [prompt, setPrompt] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`);
        const d = await r.json();
        if (d.config) {
          setPrompt(d.config.system_prompt || "");
          setWelcomeMsg(d.config.welcome_msg || "");
          setWaitingMsg(d.config.waiting_msg || "");
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
      const r = await fetch(`/api/wecom/channels/${KF_CHANNEL_ID}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            system_prompt: prompt,
            welcome_msg: welcomeMsg,
            waiting_msg: waitingMsg,
          },
        }),
      });
      const d = await r.json();
      if (d.ok) toast.success("保存成功");
      else toast.error(d.error || "保存失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 系统指令 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4" style={{ color: C.brand }} />
          <span className="text-sm font-semibold" style={{ color: C.textMain }}>AI 系统指令</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          className="w-full text-sm rounded-xl border p-3 resize-none outline-none focus:ring-2"
          style={{
            borderColor: C.line,
            color: C.textMain,
            backgroundColor: C.bg,
          }}
          placeholder="请输入 AI 助手的系统指令，用于定义 AI 的角色、回复风格和规则..."
        />
        <div className="text-xs mt-1" style={{ color: C.textSub }}>
          {prompt.length} 字符
        </div>
      </div>

      {/* 欢迎语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4" style={{ color: C.brand }} />
          <span className="text-sm font-semibold" style={{ color: C.textMain }}>欢迎语</span>
        </div>
        <textarea
          value={welcomeMsg}
          onChange={(e) => setWelcomeMsg(e.target.value)}
          rows={3}
          className="w-full text-sm rounded-xl border p-3 resize-none outline-none focus:ring-2"
          style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
          placeholder="用户首次发消息时的欢迎语（留空则不发送）"
        />
      </div>

      {/* 等待提示 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="w-4 h-4" style={{ color: C.brand }} />
          <span className="text-sm font-semibold" style={{ color: C.textMain }}>思考中提示语</span>
        </div>
        <input
          value={waitingMsg}
          onChange={(e) => setWaitingMsg(e.target.value)}
          className="w-full text-sm rounded-xl border p-3 outline-none focus:ring-2"
          style={{ borderColor: C.line, color: C.textMain, backgroundColor: C.bg }}
          placeholder="AI 思考时先发送的提示语，如：正在思考中，请稍候..."
        />
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
        style={{ backgroundColor: C.brand }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "保存中..." : "保存配置"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 知识库 Tab
// ═══════════════════════════════════════════════════════════════
function KnowledgeTab() {
  const [stats, setStats] = useState({ kb_count: 0, item_count: 0, file_count: 0, char_count: 0 });
  const [sysStats, setSysStats] = useState({ item_count: 0, file_count: 0 });
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addQuestion, setAddQuestion] = useState("");
  const [addAnswer, setAddAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 系统默认知识库是 channel_id=2（is_system=1）
  const SYS_KB_CHANNEL_ID = 2;
  const queryStr = `channel_id=${KF_CHANNEL_ID}`;

  async function loadData() {
    setLoading(true);
    try {
      const [s, src, sys] = await Promise.all([
        fetch(`/api/wecom/ch/kb/stats?${queryStr}`).then((r) => r.json()),
        fetch(`/api/wecom/ch/kb/sources?${queryStr}`).then((r) => r.json()),
        fetch(`/api/wecom/ch/kb/stats?channel_id=${SYS_KB_CHANNEL_ID}`).then((r) => r.json()),
      ]);
      if (s.ok) setStats(s);
      if (src.ok) setSources(src.sources || []);
      if (sys.ok) setSysStats({ item_count: sys.item_count || 0, file_count: sys.file_count || 0 });
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

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
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAdd() {
    if (!addAnswer.trim()) { toast.error("请输入答案内容"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/wecom/ch/kb/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_type: KF_CHANNEL_TYPE,
          channel_id: KF_CHANNEL_ID,
          question: addQuestion || null,
          answer: addAnswer,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("添加成功");
        setShowAddModal(false);
        setAddQuestion(""); setAddAnswer("");
        loadData();
      } else toast.error(d.error || "添加失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sourceFile: string) {
    try {
      const res = await fetch(
        `/api/wecom/ch/kb/source?${queryStr}&source_file=${encodeURIComponent(sourceFile)}`,
        { method: "DELETE" }
      );
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteConfirm(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch {
      toast.error("删除失败");
    }
  }

  function fmtChars(n: number) {
    if (n >= 10000) return (n / 10000).toFixed(1) + "万";
    return String(n);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 系统默认知识库状态提示（只读） */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3 border"
        style={{ backgroundColor: "#EAF4FF", borderColor: "#B3D4F5" }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#D0E8FF" }}>
          <BookOpen className="w-4 h-4" style={{ color: "#2980B9" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold" style={{ color: "#1A5276" }}>系统默认知识库（共享）</div>
          <div className="text-xs mt-0.5" style={{ color: "#2980B9" }}>
            {sysStats.item_count} 条内容 · {sysStats.file_count} 个文件 · AI 回复时自动召唤，无需配置
          </div>
        </div>
        <div className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#D0E8FF", color: "#2980B9" }}>已启用</div>
      </div>

      {/* 私有知识库统计卡片 */}
      <div className="text-xs font-semibold px-1" style={{ color: C.textSub }}>我的私有知识库</div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "知识库", value: stats.kb_count },
          { label: "条目", value: stats.item_count },
          { label: "文件", value: stats.file_count },
          { label: "字符", value: fmtChars(stats.char_count) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: C.line }}>
            <div className="text-lg font-bold" style={{ color: C.brand }}>{s.value}</div>
            <div className="text-[11px]" style={{ color: C.textSub }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ borderColor: C.brand, color: C.brand, backgroundColor: C.brandLight }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "上传中..." : "上传文件"}
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 text-white active:scale-[0.98] transition-transform"
          style={{ backgroundColor: C.brand }}
        >
          <Plus className="w-4 h-4" />
          手动添加
        </button>
        <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.csv,.pdf,.docx,.txt" onChange={handleUpload} />
      </div>

      {/* 来源文件列表 */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: C.line }}>
        <div className="px-4 py-3 border-b text-sm font-semibold" style={{ borderColor: C.line, color: C.textMain }}>
          来源文件 ({sources.length})
        </div>
        {sources.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: C.textSub }}>
            暂无知识库内容，请上传文件或手动添加
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: C.line }}>
            {sources.map((s: any) => (
              <li key={s.source_file} className="px-4 py-3 flex items-center gap-3">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: C.brand }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: C.textMain }}>{s.source_file}</div>
                  <div className="text-xs" style={{ color: C.textSub }}>{s.item_count} 条 · {formatDate(s.latest_time)}</div>
                </div>
                {deleteConfirm === s.source_file ? (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(s.source_file)}
                      className="text-xs text-white bg-red-500 rounded-lg px-2 py-1"
                    >确认删除</button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1"
                    >取消</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(s.source_file)}
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ color: "#EF4444" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 手动添加弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: C.textMain }}>手动添加知识条目</span>
              <button onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>问题（可选）</label>
              <input
                value={addQuestion}
                onChange={(e) => setAddQuestion(e.target.value)}
                className="w-full text-sm rounded-xl border p-3 outline-none"
                style={{ borderColor: C.line }}
                placeholder="如：产品价格是多少"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: C.textSub }}>答案内容（必填）</label>
              <textarea
                value={addAnswer}
                onChange={(e) => setAddAnswer(e.target.value)}
                rows={5}
                className="w-full text-sm rounded-xl border p-3 resize-none outline-none"
                style={{ borderColor: C.line }}
                placeholder="请输入知识内容..."
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: C.brand }}
            >
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
      const params = new URLSearchParams({
        channel_id: String(KF_CHANNEL_ID),
        channel_type: KF_CHANNEL_TYPE,
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
      });
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) { setLogs(data.logs); setTotal(data.total || 0); setPage(p); }
      else toast.error(data.error || "加载失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLogs(0); }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: C.textSub }}>共 {total} 条对话记录</span>
        <button
          onClick={() => fetchLogs(page)}
          className="p-1.5 rounded-lg"
          style={{ color: C.brand }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.brand }} />
        </div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: C.textSub }}>暂无对话记录</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-white rounded-2xl border shadow-sm overflow-hidden"
              style={{ borderColor: C.line }}
            >
              <button
                className="w-full px-4 py-3 flex items-start gap-3 text-left"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: C.textMain }}>
                    {log.user_message || "(无内容)"}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: C.textSub }}>
                    {log.wecom_user_id} · {formatDate(log.created_at)}
                  </div>
                </div>
                {expanded === log.id ? (
                  <ChevronDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.textSub }} />
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.textSub }} />
                )}
              </button>
              {expanded === log.id && (
                <div className="px-4 pb-3 space-y-2 border-t" style={{ borderColor: C.line }}>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: C.textSub }}>用户消息</div>
                    <div className="text-sm p-2 rounded-xl" style={{ backgroundColor: C.bg, color: C.textMain }}>
                      {log.user_message}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: C.textSub }}>AI 回复</div>
                    <div className="text-sm p-2 rounded-xl" style={{ backgroundColor: C.brandLight, color: C.textMain }}>
                      {log.reply_preview}
                    </div>
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

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => fetchLogs(page - 1)}
            disabled={page === 0 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: C.line, color: C.brand }}
          >
            上一页
          </button>
          <span className="text-sm" style={{ color: C.textSub }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => fetchLogs(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: C.line, color: C.brand }}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 营养俱乐部主页
// ═══════════════════════════════════════════════════════════════
type TabKey = "prompt" | "kb" | "logs";

const TABS: { key: TabKey; label: string; icon: typeof Bot }[] = [
  { key: "prompt", label: "AI 指令", icon: Bot },
  { key: "kb", label: "知识库", icon: BookOpen },
  { key: "logs", label: "对话日志", icon: MessageSquare },
];

function NutritionClubPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("prompt");

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
        style={{
          height: 52,
          background: `linear-gradient(135deg,${C.brandDeep} 0%,${C.brand} 100%)`,
        }}
      >
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-full"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-[17px] font-bold tracking-wide text-white">
          营养俱乐部 · AI 客服
        </span>
        <div className="w-8" />
      </header>

      {/* Tab 切换 */}
      <div className="sticky top-[52px] z-10 px-4 py-2" style={{ backgroundColor: C.bg }}>
        <div
          className="flex rounded-xl p-1"
          style={{ backgroundColor: C.line }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 text-xs py-2 rounded-lg font-medium transition-colors`}
                style={
                  activeTab === t.key
                    ? { backgroundColor: C.white, color: C.brand }
                    : { color: C.textSub }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto px-4 pt-2">
        {activeTab === "prompt" && <AiPromptTab />}
        {activeTab === "kb" && <KnowledgeTab />}
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "#F7F4F2" }}
    >
      <div className="text-4xl font-bold text-gray-300 mb-3">{slug}</div>
      <div className="text-gray-500 text-sm">该项目页面正在建设中</div>
    </div>
  );
}
