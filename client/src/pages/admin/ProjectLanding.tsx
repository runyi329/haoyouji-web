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
import React, { Suspense } from "react";
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, BookOpen, MessageSquare, Loader2, Upload, Plus,
  Trash2, ChevronRight, ChevronDown, Save, RefreshCw, FileText, X,
  Users, Settings, Sparkles, ToggleLeft, ToggleRight, Check, User,
  Shield, ShieldOff, // reserved for future use
  HelpCircle, ChevronLeft, Pencil, Camera, ImageIcon, Mail, Copy,
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
const PLATFORM_PROMPT_CHANNEL_ID = 1; // 平台共享指令
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


// ─── 素材库卡片 ──────────────────────────────────────────────────────────────
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

function MaterialsCard({ channelId, theme = C }: { channelId: number; theme?: typeof C }) {
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
      {/* 标题行 */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: theme.brandLight, borderBottom: `1px solid ${theme.line}` }}>
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold" style={{ color: theme.textMain }}>素材库</div>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.brand, color: '#fff' }}>{materials.length}</span>
        </div>
        <div>
          <input ref={matFileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.docx,.xlsx,.pptx,.txt" onChange={handleFileSelect} />
          <div
            onClick={() => matFileRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: theme.brand, cursor: 'pointer',
              fontSize: 11, color: '#fff', fontWeight: 600, userSelect: 'none' as const,
            }}
          >+</div>
        </div>
      </div>

      {/* 说明文字 */}
      <div className="px-4 py-2.5" style={{ backgroundColor: '#FAFBFF', borderBottom: `1px solid ${theme.line}` }}>
        <p className="text-xs leading-relaxed" style={{ color: theme.textSub }}>
          上传图片、视频、文件，并用自然语言描述「什么时候发这个」。AI 对话时会自动判断并发送对应素材给客户。
        </p>
      </div>

      {/* 素材列表 */}
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
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="w-full text-sm rounded-lg border px-3 py-1.5 outline-none"
                        style={{ borderColor: theme.brand }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: theme.textSub }}>触发描述（告诉 AI 什么时候发这个）</div>
                      <textarea
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        rows={3}
                        placeholder="例：当客户询问如何订购、怎么下单时，发送这张扫码订购二维码海报"
                        className="w-full text-sm rounded-lg border px-3 py-2 resize-none outline-none"
                        style={{ borderColor: theme.line }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: theme.line, color: theme.textSub }}>取消</button>
                      <button
                        onClick={() => handleSaveEdit(mat.id)}
                        disabled={savingEdit}
                        className="text-xs px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-60"
                        style={{ backgroundColor: theme.brand }}
                      >
                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* 缩略图 / 类型图标 */}
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: theme.brandLight }}>
                      {mat.type === "image" && mat.storage_url ? (
                        <img src={mat.storage_url} alt={mat.title} className="w-full h-full object-cover" />
                      ) : (
                        getTypeIcon(mat.type)
                      )}
                    </div>
                    {/* 信息区 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: theme.textMain }}>{mat.title}</div>
                      {mat.description ? (
                        <div className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.textSub }}>{mat.description}</div>
                      ) : (
                        <div className="text-xs mt-0.5 italic" style={{ color: '#D1D5DB' }}>未设置触发描述（AI 不会自动发送）</div>
                      )}
                      <div className="text-xs mt-1" style={{ color: '#D1D5DB' }}>{fmtSize(mat.file_size)}</div>
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(mat.id); setEditTitle(mat.title); setEditDesc(mat.description || ""); }}
                        className="text-xs border rounded-lg px-2 py-1"
                        style={{ borderColor: theme.line, color: theme.textSub }}
                      >编辑</button>
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

      {/* 上传弹窗 */}
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
              <input
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                className="w-full text-sm rounded-xl border p-3 outline-none"
                style={{ borderColor: theme.line }}
                placeholder="为这个素材起个名字"
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSub }}>触发描述（告诉 AI 什么时候发这个）</label>
              <textarea
                value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)}
                rows={3}
                placeholder="例：当客户询问如何订购、怎么下单、购买流程时，发送这张扫码订购二维码海报"
                className="w-full text-sm rounded-xl border p-3 resize-none outline-none"
                style={{ borderColor: theme.line }}
              />
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

// ─── 数字分身卡片（客户端只读概览） ────────────────────────────────────────────
function DigitalTwinCard({ channelId, theme = C }: { channelId: string; theme?: typeof C }) {
  const [stats, setStats] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kbStats, setKbStats] = useState({ kb_count: 1, item_count: 0, char_count: 0 });

  useEffect(() => {
    Promise.all([
      fetch(`/api/wecom/corpus/stats?channel_id=${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/ch/kb/stats?channel_id=${channelId}`).then(r => r.json()).catch(() => ({})),
    ]).then(([corpus, kb]) => {
      if (corpus.ok) { setStats(corpus); setEnabled(corpus.twin_enabled === 1 || corpus.twin_enabled === true); }
      setKbStats({
        kb_count: kb.kb_count || 1,
        item_count: kb.item_count || 0,
        char_count: kb.char_count || 0,
      });
    }).finally(() => setLoading(false));
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
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.line }}>
      {/* 标题栏（浅绿背景） */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: theme.brandLight, borderBottom: `1px solid ${theme.line}` }}>
        <span className="text-sm font-semibold" style={{ color: theme.textMain }}>我的数字分身</span>
        {/* 与共享知识库完全一致的 toggle 开关 */}
        <div
          onClick={toggling ? undefined : handleToggle}
          style={{
            position: 'relative', display: 'inline-block',
            width: 40, height: 22, borderRadius: 11,
            backgroundColor: enabled ? theme.brand : '#D1D5DB',
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
      <div className="px-4 py-3" style={{ backgroundColor: theme.white }}>
        {loading ? (
          <div className="text-center py-4 text-sm" style={{ color: theme.textSub }}>加载中…</div>
        ) : (
          <div className="space-y-2">
            {/* 三个指标：知识库数 / 条目数 / 字符数 */}
            <div className="flex items-baseline gap-4">
              <span><span className="text-lg font-bold" style={{ color: theme.textMain }}>{kbStats.kb_count}</span><span className="text-xs ml-0.5" style={{ color: theme.textSub }}>知识库</span></span>
              <span><span className="text-lg font-bold" style={{ color: theme.textMain }}>{kbStats.item_count.toLocaleString()}</span><span className="text-xs ml-0.5" style={{ color: theme.textSub }}>条目</span></span>
              <span><span className="text-lg font-bold" style={{ color: theme.textMain }}>{kbStats.char_count >= 10000 ? `${(kbStats.char_count / 10000).toFixed(1)}万` : kbStats.char_count.toLocaleString()}</span><span className="text-xs ml-0.5" style={{ color: theme.textSub }}>字符</span></span>
            </div>
            {/* 覆盖场景标签 */}
            {stats?.scene_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stats.scene_tags.map((s: any) => (
                  <span key={s.tag} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>
                    {SCENE_LABEL[s.tag] || s.tag}
                  </span>
                ))}
              </div>
            )}
            {/* 底部更新时间 */}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${theme.line}` }}>
              <span className="text-xs" style={{ color: theme.textSub }}>
                {stats?.last_updated ? `更新至 ${new Date(stats.last_updated).toLocaleDateString('zh-CN')}` : '暂无更新记录'}
              </span>
              <span className="text-xs" style={{ color: theme.textSub }}>
                分身风格 <span className="font-semibold" style={{ color: enabled ? theme.brand : '#9CA3AF' }}>{enabled ? '已开启' : '未开启'}</span>
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

// 服务商代码 → 中文名称
function providerLabel(provider?: string): string {
  if (!provider) return '-';
  const map: Record<string, string> = {
    hunyuan: '腾讯混元',
    deepseek: 'DeepSeek',
    manus: 'Manus',
    openai: 'OpenAI',
  };
  return map[provider] || provider;
}
// 从 api_base 提取域名（去掉协议与路径）
function apiHost(apiBase?: string): string {
  if (!apiBase) return '';
  return apiBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
// API Key 脱敏展示
function maskKey(key?: string): string {
  if (!key) return '未配置';
  if (key.length <= 10) return '***已配置';
  return `${key.substring(0, 6)}***...***${key.slice(-4)}`;
}

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
function ConfigTab({ onProfileUpdate, channelId = KF_CHANNEL_ID, channelType = KF_CHANNEL_TYPE, theme = C }: { onProfileUpdate?: (name: string, avatarUrl: string) => void; channelId?: number; channelType?: string; theme?: typeof C } = {}) {
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
  // 全局 AI 配置（平台管理→AI模型配置，对话回复 chat_reply 场景），用于渠道详情页联动显示
  const [globalAi, setGlobalAi] = useState<{ provider: string; model_name: string; api_base: string; api_key: string; label?: string } | null>(null);
  const [globalEmbed, setGlobalEmbed] = useState<{ provider: string; model_name: string; api_base: string; api_key: string } | null>(null);
  const [kbName, setKbName] = useState("");
  const [corpId, setCorpId] = useState("");
  const [siteUsername, setSiteUsername] = useState("");

  // 服务商共享库配置
  const [serviceBindings, setServiceBindings] = useState<{ id: number; service_tenant_id: number; service_tenant_name: string; clinic_channel_id?: number }[]>([]);
  const [allSharedKbs, setAllSharedKbs] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [clinicKbMap, setClinicKbMap] = useState<Record<number, number[]>>({}); // clinic_channel_id → kb_ids[]
  const [showClinicKbPanel, setShowClinicKbPanel] = useState<number | null>(null); // 当前展开的 clinic_channel_id
  const [savingClinicKb, setSavingClinicKb] = useState<number | null>(null);

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
        // 解析全局 AI 模型配置，提取对话回复（chat_reply）与向量（embedding）场景
        try {
          const aiCfg = await aiCfgRes.json();
          if (aiCfg?.ok && Array.isArray(aiCfg.configs)) {
            const chatCfg = aiCfg.configs.find((c: any) => c.use_case === "chat_reply");
            if (chatCfg) setGlobalAi({ provider: chatCfg.provider, model_name: chatCfg.model_name, api_base: chatCfg.api_base, api_key: chatCfg.api_key, label: chatCfg.use_case_label });
            const embedCfg = aiCfg.configs.find((c: any) => c.use_case === "embedding");
            if (embedCfg) setGlobalEmbed({ provider: embedCfg.provider, model_name: embedCfg.model_name, api_base: embedCfg.api_base, api_key: embedCfg.api_key });
          }
        } catch (_) { /* 全局配置获取失败不阻断主流程 */ }
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
        // 加载服务商绑定列表和共享库列表
        try {
          const [bindRes, sharedKbRes] = await Promise.all([
            fetch(`/api/wecom/channels/${channelId}/service-bindings`),
            fetch(`/api/wecom/shared-kbs`),
          ]);
          const bindData = await bindRes.json();
          const sharedKbData = await sharedKbRes.json();
          const bindings: { id: number; service_tenant_id: number; service_tenant_name: string; clinic_channel_id?: number }[] = [];
          if (Array.isArray(bindData?.bindings)) {
            for (const b of bindData.bindings) {
              // 查询每个诊所的子渠道 channel_id
              try {
                const r = await fetch(`/api/wecom/service-binding/channel?service_type=yaban&service_tenant_id=${b.service_tenant_id}`);
                const d = await r.json();
                bindings.push({ ...b, clinic_channel_id: d?.binding?.channel_id || undefined });
              } catch { bindings.push(b); }
            }
          }
          setServiceBindings(bindings);
          if (Array.isArray(sharedKbData)) setAllSharedKbs(sharedKbData);
          // 加载每个诊所子渠道已绑定的共享库
          const map: Record<number, number[]> = {};
          for (const b of bindings) {
            if (b.clinic_channel_id) {
              try {
                const r = await fetch(`/api/wecom/channels/${b.clinic_channel_id}/shared-kbs`);
                const d = await r.json();
                map[b.clinic_channel_id] = Array.isArray(d?.kb_ids) ? d.kb_ids : [];
              } catch { map[b.clinic_channel_id] = []; }
            }
          }
          setClinicKbMap(map);
        } catch { /* 服务商配置加载失败不阻断主流程 */ }
        // 加载分身名称和头像
        if (channelList?.channels) {
          const ch = channelList.channels.find((c: any) => c.id === channelId);
          if (ch) {
            setAvatarName(ch.name || "营养顾问分身");
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
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      // 保存渠道配置（含知识库绑定）
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

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingProfile(true);
    try {
      // 先获取当前渠道完整信息再更新
      const r = await fetch(`/api/wecom/channels/${channelId}`);
      const ch = r.ok ? await r.json() : {};
      const res = await fetch(`/api/wecom/channels/${channelId}`, {
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
      const r = await fetch(`/api/wecom/channels/${channelId}`);
      const ch = r.ok ? await r.json() : {};
      const res = await fetch(`/api/wecom/channels/${channelId}`, {
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
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.brand }} /></div>;
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 接入指引弹窗 */}
      {showGuide && <SetupGuideModal onClose={() => setShowGuide(false)} />}

      {/* 渠道状态 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: theme.textMain }}>渠道状态</span>
                <button
                  onClick={() => setShowChannelHelp(v => !v)}
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: theme.brand, color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, border: 'none', cursor: 'pointer',
                  }}
                >?</button>
              </div>
              <div className="text-xs mt-0.5" style={{ color: enabled ? theme.brand : theme.textSub }}>
                {enabled ? "已启用，AI 正在接收消息" : "已停用，AI 不接收消息"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border"
              style={{ borderColor: theme.brand, color: theme.brand, backgroundColor: theme.brandLight }}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              接入指引
            </button>
            <div
              onClick={handleToggleEnabled}
              style={{
                position: 'relative', display: 'inline-block',
                width: 40, height: 22, borderRadius: 11,
                backgroundColor: enabled ? theme.brand : '#D1D5DB',
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
          <div className="rounded-xl p-3 mt-2 text-xs space-y-2" style={{ backgroundColor: theme.brandLight, color: theme.textMain, border: `1px solid ${theme.line}` }}>
            <div className="font-semibold" style={{ color: theme.brand }}>开启状态</div>
            <div style={{ color: theme.textSub }}>客户发消息到企业微信客服，AI 自动接收并回复，欢迎语、等待提示语、抄送通知均正常工作。</div>
            <div className="font-semibold" style={{ color: theme.brand }}>关闭状态</div>
            <div style={{ color: theme.textSub }}>AI 停止自动回复，客户消息将不被处理。适用场景：系统维护、紧急暂停、切换为全人工接待。</div>
            <div className="font-semibold" style={{ color: theme.brand }}>注意</div>
            <div style={{ color: theme.textSub }}>关闭后客户消息将无人处理，请确认已有人工接待方案再操作。</div>
          </div>
        )}
      </div>

      {/* 欢迎语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: theme.textMain }}>欢迎语</div>
          <div
            onClick={() => setWelcomeEnabled(!welcomeEnabled)}
            style={{
              position: 'relative', display: 'inline-block',
              width: 40, height: 22, borderRadius: 11,
              backgroundColor: welcomeEnabled ? theme.brand : '#D1D5DB',
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
            style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            placeholder="用户首次发消息时自动回复..."
          />
        )}
        {!welcomeEnabled && (
          <div className="text-xs py-1" style={{ color: theme.textSub }}>已关闭，不发送欢迎语</div>
        )}
      </div>

      {/* 等待提示语 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold" style={{ color: theme.textMain }}>等待提示语</div>
          <div
            onClick={() => setWaitingEnabled(!waitingEnabled)}
            style={{
              position: 'relative', display: 'inline-block',
              width: 40, height: 22, borderRadius: 11,
              backgroundColor: waitingEnabled ? theme.brand : '#D1D5DB',
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
            style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            placeholder="如：收到，AI 正在思考中，请稍候..."
          />
        )}
        {!waitingEnabled && (
          <div className="text-xs py-1" style={{ color: theme.textSub }}>已关闭，不发送等待提示语</div>
        )}
      </div>


      {/* 消息抄送 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: theme.line }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: theme.textMain }}>消息抄送通知</span>
            <button
              onClick={() => setShowNotifyHelp(v => !v)}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                backgroundColor: theme.brand, color: '#fff',
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
              backgroundColor: notifyEnabled ? theme.brand : '#D1D5DB',
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
          <div className="rounded-xl p-3 mb-2 text-xs space-y-2" style={{ backgroundColor: theme.brandLight, color: theme.textMain, border: `1px solid ${theme.line}` }}>
            <div className="font-semibold" style={{ color: theme.brand }}>什么是 userid？</div>
            <div style={{ color: theme.textSub }}>userid 是企业微信内部成员的帐号 ID，仅内部员工可收到抄送通知，客户（外部人员）无法收到。</div>
            <div className="font-semibold" style={{ color: theme.brand }}>如何查看 userid？</div>
            <div style={{ color: theme.textSub }}>方式一：登录企业微信管理后台 → 通讯录 → 点击某个成员 → 查看「账号」字段</div>
            <div style={{ color: theme.textSub }}>方式二：手机企业微信 → 我 → 个人信息 → 账号，即为本人 userid</div>
            <div className="font-semibold" style={{ color: theme.brand }}>填写示例</div>
            <div style={{ color: theme.textSub }}>单人：<span style={{color: theme.brand}}>HuXX</span>　多人：<span style={{color: theme.brand}}>HuXX,ZhangXX,LiXX</span>（英文逗号分隔）</div>
          </div>
        )}
        {notifyEnabled && (
          <div className="space-y-2 mt-2">
            <div className="text-xs" style={{ color: theme.textSub }}>输入接收人 userid（多个用英文逗号分隔）</div>
            <input
              value={notifyUserids.join(",")}
              onChange={e => setNotifyUserids(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="如：HuXX,ZhangXX"
              className="w-full text-sm rounded-xl border p-3 outline-none"
              style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            />
            {notifyUserids.length > 0 && (
              <div className="text-xs px-3 py-2 rounded-xl" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>
                已选 {notifyUserids.length} 人：{notifyUserids.join("、")}
              </div>
            )}
          </div>
        )}
      </div>


      {/* 推广链接卡片 */}
      {kfId && (
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
          {/* 链接展示 */}
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
          {/* 二维码按钮 */}
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
          {/* 全屏二维码覆盖层 */}
          {showQr && (
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
              onClick={() => setShowQr(false)}
            >
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

      {/* 系统连接总览 */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.line }}>
        {/* 标题行 */}
        <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: theme.brand }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
          </svg>
          <span className="text-sm font-semibold text-white">系统连接总览</span>
        </div>

        <div className="divide-y" style={{ backgroundColor: '#fff', borderColor: theme.line }}>

          {/* 区块标题：企业微信 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>企业微信</span>
          </div>

          {/* 企业号 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex flex-col flex-shrink-0">
              <span className="text-xs" style={{ color: theme.textSub }}>企业号</span>
              <span className="text-[10px]" style={{ color: theme.textSub, opacity: 0.6 }}>corpid</span>
            </div>
            <span className="text-xs font-mono" style={{ color: theme.textMain }}>
              {corpId ? `${corpId.substring(0, 6)}${'*'.repeat(corpId.length - 10)}${corpId.slice(-4)}` : '-'}
            </span>
          </div>

          {/* 客服账号 open_kfid */}
          <div className="px-4 py-2.5 flex items-start justify-between gap-2">
            <div className="flex flex-col flex-shrink-0">
              <span className="text-xs" style={{ color: theme.textSub }}>客服账号 ID</span>
              <span className="text-[10px]" style={{ color: theme.textSub, opacity: 0.6 }}>open_kfid</span>
            </div>
            <span className="text-xs font-mono text-right break-all max-w-[55%]" style={{ color: theme.textMain }}>
              {kfId ? `${kfId.substring(0, 6)}${'*'.repeat(Math.max(0, kfId.length - 10))}${kfId.slice(-4)}` : <span style={{ color: theme.textSub }}>未配置</span>}
            </span>
          </div>

          {/* 接入方式 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>接入方式</span>
            <span className="text-xs" style={{ color: theme.textMain }}>微信客服 API 回调</span>
          </div>

          {/* 企微连接状态 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>连接状态</span>
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: kfId ? '#16A34A' : '#EF4444' }}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${kfId ? 'bg-green-500' : 'bg-red-400'}`}></span>
              {kfId ? '已连接' : '未配置'}
            </span>
          </div>

          {/* 区块标题： AI 引擎（联动平台全局配置） */}
          <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>AI 引擎</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.brand + '1A', color: theme.brand }}>跟随平台全局</span>
          </div>

          {/* 服务商 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>服务商</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{providerLabel(globalAi?.provider)}</span>
          </div>

          {/* API 域名 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>API 域名</span>
            <span className="text-xs font-mono text-right break-all max-w-[60%]" style={{ color: theme.textMain }}>{apiHost(globalAi?.api_base) || '-'}</span>
          </div>

          {/* API Key 状态 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>API Key</span>
            <span className="text-xs font-mono" style={{ color: globalAi?.api_key ? theme.textMain : '#EF4444' }}>{maskKey(globalAi?.api_key)}</span>
          </div>

          {/* 当前模型（来自全局配置） */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>当前模型</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>
              {globalAi?.model_name || (AI_MODELS.find(m => m.value === aiModel)?.label || aiModel)}
            </span>
          </div>

          {/* 区块标题：向量引擎（语义检索） */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>向量引擎·语义检索</span>
          </div>

          {/* Embedding 服务商 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>向量服务</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{providerLabel(globalEmbed?.provider)}</span>
          </div>

          {/* Embedding API 域名 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>Embedding API</span>
            <span className="text-xs font-mono text-right break-all max-w-[60%]" style={{ color: theme.textMain }}>{apiHost(globalEmbed?.api_base) || '-'}</span>
          </div>

          {/* Embedding Key（脱敏） */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>Embedding Key</span>
            <span className="text-xs font-mono" style={{ color: globalEmbed?.api_key ? theme.textMain : '#EF4444' }}>{maskKey(globalEmbed?.api_key)}</span>
          </div>

          {/* 向量模型 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>向量模型</span>
            <span className="text-xs font-medium" style={{ color: theme.textMain }}>{globalEmbed?.model_name || '-'}</span>
          </div>

          {/* 用途 */}
          <div className="px-4 py-2.5 flex items-start justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>用途</span>
            <span className="text-xs text-right max-w-[60%]" style={{ color: theme.textMain }}>知识库/规则语义检索与查重</span>
          </div>

          {/* 区块标题：知识库 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>知识库</span>
          </div>

          {/* 绑定知识库 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>私人知识库</span>
            <span className="text-xs" style={{ color: kbName ? theme.textMain : theme.textSub }}>{kbName || '未绑定'}</span>
          </div>

          {/* 共享知识库 */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: theme.textSub }}>共享知识库</span>
            <span className="text-xs" style={{ color: theme.textMain }}>平台共享库（自动接入）</span>
          </div>

          {/* 服务商共享库配置 */}
          {serviceBindings.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>服务商共享库配置</span>
              </div>
              <div className="px-4 pb-2 text-[11px]" style={{ color: theme.textSub }}>为每家已绑定诊所指定可访问的平台共享库</div>
              {serviceBindings.map(b => (
                <div key={b.id} className="mx-4 mb-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.line}` }}>
                  {/* 诊所标题行 */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
                    style={{ backgroundColor: showClinicKbPanel === b.clinic_channel_id ? theme.brandLight : 'transparent' }}
                    onClick={() => setShowClinicKbPanel(showClinicKbPanel === b.clinic_channel_id ? null : (b.clinic_channel_id ?? null))}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.brandLight }}>
                        <span className="text-[10px] font-bold" style={{ color: theme.brand }}>{b.service_tenant_name?.[0] || '诊'}</span>
                      </div>
                      <span className="text-xs font-medium" style={{ color: theme.textMain }}>{b.service_tenant_name || `诊所 ${b.service_tenant_id}`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {b.clinic_channel_id ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>
                          {(clinicKbMap[b.clinic_channel_id] || []).length} 个共享库
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: '#EF4444' }}>未建子渠道</span>
                      )}
                      <span className="text-xs" style={{ color: theme.textSub }}>{showClinicKbPanel === b.clinic_channel_id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {/* 展开的共享库选择面板 */}
                  {showClinicKbPanel === b.clinic_channel_id && b.clinic_channel_id && (
                    <div className="px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${theme.line}` }}>
                      {allSharedKbs.length === 0 ? (
                        <div className="text-xs py-2" style={{ color: theme.textSub }}>暂无平台共享库，请先在「知识库」中创建共享库</div>
                      ) : (
                        <>
                          <div className="text-[11px] mb-2" style={{ color: theme.textSub }}>勾选该诊所可访问的共享库：</div>
                          {allSharedKbs.map(kb => {
                            const selected = (clinicKbMap[b.clinic_channel_id!] || []).includes(kb.id);
                            return (
                              <div
                                key={kb.id}
                                className="flex items-center gap-2 py-1.5 cursor-pointer"
                                onClick={() => {
                                  const cid = b.clinic_channel_id!;
                                  const cur = clinicKbMap[cid] || [];
                                  const next = selected ? cur.filter(id => id !== kb.id) : [...cur, kb.id];
                                  setClinicKbMap(prev => ({ ...prev, [cid]: next }));
                                }}
                              >
                                <div
                                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                  style={{
                                    backgroundColor: selected ? theme.brand : 'transparent',
                                    border: `1.5px solid ${selected ? theme.brand : theme.line}`
                                  }}
                                >
                                  {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                                </div>
                                <div>
                                  <div className="text-xs font-medium" style={{ color: theme.textMain }}>{kb.name}</div>
                                  {kb.description && <div className="text-[11px]" style={{ color: theme.textSub }}>{kb.description}</div>}
                                </div>
                              </div>
                            );
                          })}
                          <button
                            className="mt-2 w-full py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1"
                            style={{ backgroundColor: savingClinicKb === b.clinic_channel_id ? '#9CA3AF' : theme.brand }}
                            disabled={savingClinicKb === b.clinic_channel_id}
                            onClick={async () => {
                              const cid = b.clinic_channel_id!;
                              setSavingClinicKb(cid);
                              try {
                                const r = await fetch(`/api/wecom/channels/${cid}/shared-kbs`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ kb_ids: clinicKbMap[cid] || [] }),
                                });
                                const d = await r.json();
                                if (d.ok) { toast.success(`已为 ${b.service_tenant_name} 保存共享库配置`); setShowClinicKbPanel(null); }
                                else toast.error(d.error || '保存失败');
                              } catch { toast.error('网络错误'); }
                              finally { setSavingClinicKb(null); }
                            }}
                          >
                            {savingClinicKb === b.clinic_channel_id ? '保存中...' : '保存共享库配置'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* 区块标题：脉动网 */}
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.brand }}>脉动网</span>
          </div>

          {/* 绑定账户 */}
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

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving || justSaved || !isDirty}
        className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
        style={{ backgroundColor: justSaved ? "#16A34A" : isDirty ? theme.brand : "#9CA3AF" }}
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
      const res = await fetch(`/api/wecom/custom-rules?channel_type=${channelType}`);
      const d = await res.json();
      if (d.ok) setRules(d.rules || []);
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`/api/wecom/ch/users?channel_type=${channelType}`);
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
      const body = { ...form, target_user_ids: form.target_type === "all" ? [] : form.selected_user_ids, channel_type: channelType, enabled: 1 };
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

function AvatarGrowthTab({ onProfileUpdate, channelId = KF_CHANNEL_ID, channelType = KF_CHANNEL_TYPE, theme = C }: { onProfileUpdate?: (name: string, avatarUrl: string) => void; channelId?: number; channelType?: string; theme?: typeof C } = {}) {
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

  // 智能钱包
  const [walletInfo, setWalletInfo] = useState<{
    bound: boolean;
    username?: string;
    balance: number;
    month_usdt: number;
    month_tokens: number;
    manus_credits: number;
    ds_tokens: number;
    record_count: number;
    recent_logs: { id: number; amount: number; note: string; created_at: string }[];
  } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  const loadWalletInfo = () => {
    setWalletLoading(true);
    fetch(`/api/wecom/channels/${channelId}/wallet-info`)
      .then(r => r.json())
      .then(d => { if (d.ok) setWalletInfo(d); })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  };

  useEffect(() => {
    // 加载分身名称和头像
    fetch(`/api/wecom/channels/${channelId}`)
      .then(r => r.json())
      .then(ch => {
        if (ch && ch.name) setAvatarName(ch.name);
        if (ch && ch.avatar_url) setAvatarUrl(ch.avatar_url);
      })
      .catch(() => {});

    Promise.all([
      fetch(`/api/wecom/ch/kb/stats?channel_id=${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/channel-config/${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/corpus/stats?channel_id=${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/ch/logs?channel_id=${channelId}&channel_type=${channelType}&limit=1`).then(r => r.json()).catch(() => ({})),
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
    // 自动加载钱包数据，页面打开即显示余额
    loadWalletInfo();
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
        body: JSON.stringify({ channel_id: channelId, content: feedText.trim(), source: 'manual' }),
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
        body: JSON.stringify({ channel_id: channelId, url: feedUrl.trim() }),
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
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.brand }} /></div>;
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
      <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(145deg, ${theme.brandDeep} 0%, ${theme.brand} 100%)` }}>
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
                      const r = await fetch(`/api/wecom/channels/${channelId}`);
                      const ch = r.ok ? await r.json() : {};
                      const res = await fetch(`/api/wecom/channels/${channelId}`, {
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
          {/* 资产区块：左侧 2/3 知识资产 + 竖线 + 右侧 1/3 智能钱包 */}
          {(() => {
            const totalItems = kbCount + sysKbCount;
            const totalChars = kbCharCount + sysKbCharCount;
            const kbNum = sysKbEnabled ? 2 : 1;
            const fmtChar = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
            return (
              <div className="flex items-stretch mb-4" style={{ gap: 0 }}>
                {/* 左侧：数字资产账户 */}
                <div className="flex flex-col justify-center" style={{ flex: '1 1 0', paddingRight: 14 }}>
                  <div className="text-white text-[10px] opacity-55 mb-2">数字资产账户</div>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-white font-bold tracking-tight" style={{ fontSize: 28, lineHeight: 1 }}>{totalItems.toLocaleString()}</span>
                    <span className="text-white text-xs opacity-60">条目</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-[10px] opacity-45">知识库 {kbNum}个</span>
                    <span className="text-white opacity-20 text-[10px]">/</span>
                    <span className="text-white text-[10px] opacity-45">{fmtChar(totalChars)}字符</span>
                  </div>
                </div>
                {/* 竖分隔线 */}
                <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.25)', flexShrink: 0, alignSelf: 'stretch' }} />
                {/* 右侧：智能钱包账户 */}
                <button
                  className="flex flex-col justify-center"
                  style={{ flex: '1 1 0', paddingLeft: 14 }}
                  onClick={() => {
                    setShowWallet(true);
                    if (!walletInfo) loadWalletInfo();
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-[10px] opacity-55">智能钱包账户</span>
                    <span className="text-white opacity-30" style={{ fontSize: 12 }}>›</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-white font-bold tracking-tight" style={{ fontSize: 28, lineHeight: 1 }}>
                      {walletLoading && !walletInfo ? '--' : walletInfo?.bound ? walletInfo.balance.toFixed(2) : '--'}
                    </span>
                    <span className="text-white text-xs opacity-60">USDT</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-[10px] opacity-45">本月 token</span>
                    <span className="text-white text-[10px] opacity-70 font-medium">
                      {walletLoading && !walletInfo ? '--' : walletInfo?.bound ? `${((walletInfo.month_tokens ?? 0) >= 10000 ? ((walletInfo.month_tokens ?? 0) / 10000).toFixed(1) + '万' : (walletInfo.month_tokens ?? 0).toLocaleString())}` : '--'}
                    </span>
                  </div>
                </button>
              </div>
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

      {/* ── 智能钱包详情层 ── */}
      {showWallet && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#fff' }}>
          {/* 顶部导航 */}
          <div className="flex items-center px-4 py-3" style={{ background: `linear-gradient(145deg, ${theme.brandDeep} 0%, ${theme.brand} 100%)`, minHeight: 56 }}>
            <button
              onClick={() => setShowWallet(false)}
              className="mr-3 text-white opacity-80 text-lg"
            >←</button>
            <span className="text-white font-semibold text-base">智能钱包</span>
            <button
              onClick={loadWalletInfo}
              className="ml-auto text-white opacity-60 text-xs"
            >{walletLoading ? '刷新中…' : '刷新'}</button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto px-4 pt-5 pb-8">
            {walletLoading && !walletInfo && (
              <div className="text-center py-12 text-gray-400 text-sm">加载中…</div>
            )}
            {walletInfo && !walletInfo.bound && (
              <div className="text-center py-12 text-gray-400 text-sm">该渠道尚未绑定脉动网账户，请先在「设置」中绑定账户</div>
            )}
            {walletInfo?.bound && (
              <>
                {/* 余额卡片 */}
                <div className="rounded-2xl p-5 mb-4" style={{ background: `linear-gradient(145deg, ${theme.brandDeep} 0%, ${theme.brand} 100%)` }}>
                  <div className="text-white text-xs opacity-60 mb-1">账户余额</div>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-white text-4xl font-bold">{walletInfo.balance.toFixed(2)}</span>
                    <span className="text-white text-lg opacity-70 ml-1">USDT</span>
                  </div>
                  <div className="text-white text-xs opacity-50">账户：{walletInfo.username}</div>
                </div>

                {/* 本月消耗 */}
                <div className="rounded-xl p-4 mb-4" style={{ border: `1px solid ${theme.line}`, backgroundColor: theme.white }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: theme.textMain }}>本月 AI 消耗</div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: theme.textSub }}>Manus 积分</span>
                    <span className="text-xs font-medium" style={{ color: theme.textMain }}>{walletInfo.manus_credits.toLocaleString()} 积分</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: theme.textSub }}>DeepSeek Tokens</span>
                    <span className="text-xs font-medium" style={{ color: theme.textMain }}>{walletInfo.ds_tokens.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: theme.textSub }}>对话次数</span>
                    <span className="text-xs font-medium" style={{ color: theme.textMain }}>{walletInfo.record_count} 次</span>
                  </div>
                  <div style={{ height: 1, backgroundColor: theme.line, margin: '8px 0' }} />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: theme.textMain }}>合计费用</span>
                    <span className="text-sm font-bold" style={{ color: theme.brand }}>{(walletInfo.month_tokens ?? 0).toLocaleString()} tokens</span>
                  </div>
                </div>

                {/* 扣费流水 */}
                <div className="rounded-xl p-4" style={{ border: `1px solid ${theme.line}`, backgroundColor: theme.white }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: theme.textMain }}>扣费记录</div>
                  {walletInfo.recent_logs.length === 0 && (
                    <div className="text-xs text-center py-4" style={{ color: theme.textSub }}>暂无扣费记录</div>
                  )}
                  {walletInfo.recent_logs.map(log => (
                    <div key={log.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${theme.line}` }}>
                      <div>
                        <div className="text-xs" style={{ color: theme.textMain }}>{log.note}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: theme.textSub }}>
                          {new Date(log.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                        </div>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: log.amount < 0 ? '#ef4444' : '#22c55e' }}>
                        {log.amount > 0 ? '+' : ''}{log.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 联系充値提示 */}
                <div className="text-center mt-6">
                  <p className="text-xs" style={{ color: theme.textSub }}>需要充値？请联系管理员</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.08)' }}>
            <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-wrap gap-1">
              <div className="text-sm font-semibold" style={{ color: theme.textMain }}>克隆维度成长曲线</div>
              <div className="flex items-center gap-3">
                {CLONE_LINES.map(ab => (
                  <div key={ab.key} className="flex items-center gap-1">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: ab.color }} />
                    <span className="text-[10px]" style={{ color: theme.textSub }}>{ab.label} {ab.cur}%</span>
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
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.06)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm font-bold mb-3" style={{ color: theme.textMain }}>分身已解锁的能力</div>
          <div className="grid grid-cols-2 gap-2">
            {ABILITIES.map(ab => {
              const unlocked = equiv >= ab.unlockEquiv;
              const abProgress = unlocked ? 100 : Math.min(99, Math.round((equiv / Math.max(ab.unlockEquiv, 1)) * 100));
              const stillNeed = ab.unlockEquiv - equiv;
              return (
                <div key={ab.key} className="rounded-xl p-3"
                  style={{
                    backgroundColor: unlocked ? theme.brandLight : '#F9FAFB',
                    border: `1px solid ${unlocked ? theme.brand + '40' : '#E5E7EB'}`,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: unlocked ? theme.textMain : '#9CA3AF' }}>{ab.label}</span>
                    <span style={{ fontSize: 14 }}>{unlocked ? '' : ''}</span>
                  </div>
                  <div className="rounded-full overflow-hidden mb-1.5" style={{ height: 3, backgroundColor: unlocked ? 'rgba(39,174,96,0.2)' : 'rgba(0,0,0,0.06)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${abProgress}%`, backgroundColor: unlocked ? theme.brand : '#D1D5DB' }} />
                  </div>
                  <div className="text-[10px]" style={{ color: unlocked ? theme.brand : '#9CA3AF' }}>
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
          style={{ background: `linear-gradient(135deg, ${theme.brandDeep} 0%, ${theme.brand} 100%)` }}>
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
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}`, boxShadow: '0 2px 12px rgba(39,174,96,0.06)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm font-bold mb-0.5" style={{ color: theme.textMain }}>存入知识资产</div>
          <div className="text-[10px] mb-4" style={{ color: theme.textSub }}>投喂的知识将永久存入分身记忆</div>
          {/* 文字存入 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium" style={{ color: theme.textMain }}>文字内容</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>+1 单元</div>
            </div>
            <textarea
              rows={3}
              value={feedText}
              onChange={e => setFeedText(e.target.value)}
              placeholder="粘贴专业知识、产品说明、对话范例…"
              className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none outline-none"
              style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
            />
            <button
              onClick={handleFeedText}
              disabled={!feedText.trim() || feedingText}
              className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: feedText.trim() ? theme.brand : '#D1D5DB', color: '#fff', opacity: feedingText ? 0.6 : 1 }}
            >
              {feedingText ? '存入中…' : '存入知识库'}
            </button>
          </div>
          {/* 链接存入 */}
          <div style={{ borderTop: `1px solid ${theme.line}`, paddingTop: 14 }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium" style={{ color: theme.textMain }}>网页链接</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>+10~50 单元</div>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={feedUrl}
                onChange={e => setFeedUrl(e.target.value)}
                placeholder="https://… 公众号、健康期刊、专业文章"
                className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: theme.line, color: theme.textMain, backgroundColor: theme.bg }}
              />
              <button
                onClick={handleFeedUrl}
                disabled={!feedUrl.trim() || feedingUrl}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
                style={{ backgroundColor: feedUrl.trim() ? theme.brand : '#D1D5DB', color: '#fff', opacity: feedingUrl ? 0.6 : 1 }}
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
function AIBrainTab({ refreshKey = 0, channelId = KF_CHANNEL_ID, channelType = KF_CHANNEL_TYPE, theme = C }: { refreshKey?: number; channelId?: number; channelType?: string; theme?: typeof C } = {}) {
  // ── 第0步：AI智能整理 ──
  const [step0Open, setStep0Open] = useState(false);
  const [step0HelpOpen, setStep0HelpOpen] = useState(false);
  const [step0Input, setStep0Input] = useState("");
  const [step0Extra, setStep0Extra] = useState(""); // 补充说明/需求描述
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
  // 当前分身的专属收件邮筱（待DNS配置后替换为真实地址）
  const INBOX_EMAIL = `nutrition@mail.jiangyuchen.cn`;
  // 私人规则管理抽屉
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  // 私人知识库管理抽屉
  const [showKbDrawer, setShowKbDrawer] = useState(false);
  const [kbSources, setKbSources] = useState<any[]>([]);
  const [loadingKbSources, setLoadingKbSources] = useState(false);
  // 共享知识库管理抽屉
  const [showSysKbDrawer, setShowSysKbDrawer] = useState(false);
  const [sysKbSources, setSysKbSources] = useState<any[]>([]);
  const [sysKbExpandedSource, setSysKbExpandedSource] = useState<string | null>(null);
  const [sysKbItems, setSysKbItems] = useState<Record<string, any[]>>({});
  const [kbExpandedSource, setKbExpandedSource] = useState<string | null>(null);
  const [kbItems, setKbItems] = useState<Record<string, any[]>>({});

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
        setStep0ImagePreview(null); // 识别成功后自动清除图片预览
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


  const [step0FileLoading, setStep0FileLoading] = useState(false);
  const [step0UploadedFile, setStep0UploadedFile] = useState<string | null>(null);
  const step0DocRef = useRef<HTMLInputElement>(null);

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
      // 合并原始内容和补充说明
      let combinedText = step0Input.trim();
      if (step0Extra.trim()) {
        combinedText = combinedText
          ? `${combinedText}

---
【我的需求/补充说明】
${step0Extra.trim()}`
          : step0Extra.trim();
      }
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, channelId: channelId, kbId: 0 }),
      });
      const d = await res.json();
      if (d.ok) {
        // 兼容后端返回字符串数组的情况，统一转为对象数组
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
      // 写入成功后自动刷新数据
      loadAllData();
      setTimeout(() => { setStep0Result(null); setStep0Input(""); setStep0Extra(""); setStep0Done(false); }, 1500);
    } catch {
      toast.error("写入失败");
    } finally {
      setStep0Applying(false);
    }
  }

  // ── 第①层：AI 指令（从 ConfigTab 迁移） ──
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
  const [refreshing, setRefreshing] = useState(false);

  async function loadAllData() {
    setRefreshing(true);
    // 加载第①层：AI 指令
    fetch(`/api/wecom/channels/${channelId}/prompt-rules`)
      .then(r => r.json())
      .then(d => {
        const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d) ? d : [];
        setPromptRules(rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      })
      .finally(() => setLoadingRules(false));

    fetch(`/api/wecom/channels/${PLATFORM_PROMPT_CHANNEL_ID}/prompt-rules`)
      .then(r => r.json())
      .then(d => {
        const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d) ? d : [];
        setPlatformRules(rules.map((r: any) => ({ ...r, rule_text: r.content || r.rule_text || "" })));
      })
      .catch(() => setPlatformRules([]))
      .finally(() => setLoadingPlatformRules(false));

    // 加载第③层：知识库统计
    await Promise.all([
      fetch(`/api/wecom/ch/kb/stats?channel_id=${channelId}`).then(r => r.json()),
      fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()),
      fetch(`/api/wecom/channel-config/${channelId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/channels/${channelId}/config`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/wecom/knowledge-bases`).then(r => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/wecom/ch/kb/sources?channel_id=${channelId}`).then(r => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/wecom/ch/kb/sources?channel_type=kf`).then(r => r.json()).catch(() => ({ ok: false })),
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

  const [platformRulesExpanded, setPlatformRulesExpanded] = useState(false);
  const [platformRuleDetail, setPlatformRuleDetail] = useState<{ rule_text: string } | null>(null);
  const platformLayer1Rules = platformRules; // 显示所有平台共享指令（layer1角色定义+layer2行为规范）
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

  // 层级配置（统一绿色系风格）
  const layers = [
    {
      id: 1,
      color: theme.brand,
      bgColor: theme.brandLight,
      borderColor: theme.line,
      label: '① 角色定义 & 行为规则',
      subtitle: 'AI 的基础人设与规则',
      badge: loadingRules || loadingPlatformRules ? '-' : `${platformLayer1Rules.length + layer2Rules.length} 条`,
    },
    {
      id: 2,
      color: theme.brand,
      bgColor: theme.brandLight,
      borderColor: theme.line,
      label: '② 数字分身',
      subtitle: '客服本人的风格克隆',
      badge: null,
    },
    {
      id: 3,
      color: theme.brand,
      bgColor: theme.brandLight,
      borderColor: theme.line,
      label: '③ 知识库',
      subtitle: '标准答案库（共享 + 私人）',
      badge: `${kbStats.item_count + sysKbStats.item_count} 条`,
    },
    {
      id: 4,
      color: theme.brand,
      bgColor: theme.brandLight,
      borderColor: theme.line,
      label: '④ 历史对话记忆',
      subtitle: 'AI 对客户的理解',
      badge: `${contextRounds} 轮`,
    },
  ];

  return (
    <div className="space-y-3 pb-8 pt-2">
      {/* 第0步：AI智能整理 */}
      <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: theme.line }}>
        <div className="w-full px-4 py-3 flex items-center justify-between" style={{ backgroundColor: theme.brandLight }}>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setStep0Open(v => !v)} className="text-sm font-bold" style={{ color: theme.brand }}>⓪ AI 智能整理</button>
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
                <span className="text-base font-bold" style={{ color: theme.textMain }}>为什么要有「⓪ AI 智能整理」？</span>
                <button onClick={() => setStep0HelpOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
                  <X className="w-4 h-4" style={{ color: theme.textSub }} />
                </button>
              </div>
              <div className="space-y-3 text-sm leading-relaxed" style={{ color: theme.textMain }}>
                <p>一个优秀的 AI 分身，需要三类信息共同支擔：</p>
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: theme.brandLight }}>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>① 角色定义</span>
                    <span style={{ color: theme.textSub }}>—— AI 是谁？性格怎样？说话风格是什么？</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>② 行为规则</span>
                    <span style={{ color: theme.textSub }}>—— 遇到哪些情况该怎么做？什么不能说？</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0" style={{ color: theme.brand }}>③ 知识库</span>
                    <span style={{ color: theme.textSub }}>—— 产品价格、常见问题、专业知识等具体信息</span>
                  </div>
                </div>
                <p style={{ color: theme.textSub }}>大多数人并不知道自己输入的内容属于哪一类。<span className="font-medium" style={{ color: theme.textMain }}>第⓪步就是解决这个问题的</span>——你只需要把想说的内容粘贴进来，AI 会自动判断并分类写入对应的位置，不需要你手动区分。</p>
                <p style={{ color: theme.textSub }}>建议每次添加新内容时，优先使用这一步。</p>
              </div>
            </div>
          </div>
        )}

        {step0Open && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${theme.line}` }}>
            <div className="relative rounded-lg overflow-hidden mt-3" style={{ border: `1px solid ${theme.textMain}`, backgroundColor: '#fff' }}>
              {/* 顶部提示行 */}
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
              {/* 输入框内部底部：拍照/上传按钮 */}
              <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                {/* 合并按钮：拍照 / 上传图片 / 文件 */}
                <input
                  ref={step0FileRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // 图片类型 → OCR识别；其他 → 文件解析
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
                    <button
                      onClick={() => setStep0ImagePreview(null)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: theme.textSub, color: '#fff' }}
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                )}
                {step0UploadedFile && (
                  <span className="text-xs truncate max-w-[120px]" style={{ color: theme.brand }}>
                    {step0UploadedFile}
                  </span>
                )}
                {/* 邮件转发按钮 */}
                <button
                  onClick={() => setStep0EmailPopup(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all"
                  style={{ color: step0EmailPopup ? theme.brand : theme.textSub, borderColor: step0EmailPopup ? theme.brand : theme.line, backgroundColor: theme.bg }}
                >
                  <Mail className="w-3 h-3" />邮件
                </button>
              </div>

              {/* 邮件地址弹出卡片 */}
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

            {/* 补充说明输入框：上传图片/文字后可继续输入需求 */}
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
                            <textarea value={step0EditDraftPrompt} onChange={e => setStep0EditDraftPrompt(e.target.value)} rows={3} autoFocus className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none" style={{ border: '1px solid #7C3AED' }} />
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
                                  {p.duplicate_check.includes(',') && <span style={{ color: '#6B7280' }}>（{p.duplicate_check.split(',').slice(1).join(',')}）</span>}
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
                              <button onClick={() => { const u=[...step0Result!.kb_items]; u[i]={question:step0EditDraftQ,answer:step0EditDraftA}; setStep0Result({...step0Result!, kb_items: u}); setStep0EditKbIdx(null); }} className="text-xs px-2 py-0.5 rounded" style={{ color: theme.brand }}>保存</button>
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
                                  {item.duplicate_check.includes(',') && <span style={{ color: '#6B7280' }}>（{item.duplicate_check.split(',').slice(1).join(',')}）</span>}
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

              {/* ── 第①层内容：AI 指令管理（双层结构：平台共享 + 私人） ── */}
              {layer.id === 1 && (
                <div className="space-y-3">
                  {/* 平台共享指令卡片（带开关，参考第③层共享知识库样式） */}
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
                                <button
                                  onClick={() => setPlatformRuleDetail(rule)}
                                  className="text-xs flex-shrink-0 ml-2"
                                  style={{ color: theme.brand }}
                                >
                                  详情
                                </button>
                              </div>
                            ))}
                          </div>
                      )
                    )}
                  </div>

                  {/* 私人指令卡片（纯预览，编辑按钮开抽屉） */}
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

              {/* ── 第②层内容：数字分身 ── */}
              {layer.id === 2 && (
                <DigitalTwinCard channelId={String(channelId)} theme={theme} />
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
                  {/* 本轮上下文轮数 */}
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
                  {/* 客户长期记忆（规划中） */}
                  <div className="rounded-xl border p-3" style={{ borderColor: theme.line, backgroundColor: theme.brandLight }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: theme.brand }}>客户长期偏好记忆</div>
                        <div className="text-xs mt-0.5" style={{ color: theme.textSub }}>历史对话提炼，持久化存储客户画像</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: theme.line, color: theme.brand }}>规划中</span>
                    </div>
                  </div>
                  {/* 说明 */}
                  <div className="text-xs rounded-xl p-2.5" style={{ backgroundColor: theme.brandLight, color: theme.textSub, border: `1px solid ${theme.line}` }}>
                    <span className="font-medium" style={{ color: theme.brand }}>提示：</span>已启用数字分身（第②层）后，AI 可通过长期记忆理解用户偏好，短期上下文轮数的重要性自动降低。
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

  // ── 第0步：AI智能整理 ──
  const [step0Open, setStep0Open] = useState(false);
  const [step0Input, setStep0Input] = useState("");
  const [step0Analyzing, setStep0Analyzing] = useState(false);
  const [step0Result, setStep0Result] = useState<{ prompt_additions: { content: string; duplicate_check: string }[]; kb_items: { question: string; answer: string; duplicate_check: string }[]; summary: string } | null>(null);
  const [step0SelPrompts, setStep0SelPrompts] = useState<boolean[]>([]);
  const [step0SelKbs, setStep0SelKbs] = useState<boolean[]>([]);
  const [step0Applying, setStep0Applying] = useState(false);
  const [step0Done, setStep0Done] = useState(false);
  const [step0EditPromptIdx, setStep0EditPromptIdx] = useState<number | null>(null);
  const [step0EditKbIdx, setStep0EditKbIdx] = useState<number | null>(null);
  const [step0EditDraftPrompt, setStep0EditDraftPrompt] = useState("");
  const [step0EditDraftQ, setStep0EditDraftQ] = useState("");
  const [step0EditDraftA, setStep0EditDraftA] = useState("");

  async function handleStep0Analyze() {
    if (!step0Input.trim()) return;
    setStep0Analyzing(true);
    setStep0Result(null);
    setStep0Done(false);
    try {
      const res = await fetch("/api/wecom/ai-assist-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: step0Input, channelId: channelId, kbId: 0 }),
      });
      const d = await res.json();
      if (d.ok) {
        setStep0Result(d);
        setStep0SelPrompts(d.prompt_additions.map(() => true));
        setStep0SelKbs(d.kb_items.map(() => true));
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
      const [s, src, sys] = await Promise.all([
        fetch(`/api/wecom/ch/kb/stats?channel_id=${channelId}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/sources?channel_id=${channelId}`).then(r => r.json()),
        fetch(`/api/wecom/ch/kb/stats?channel_type=kf`).then(r => r.json()),
      ]);
      const chCfg = await fetch(`/api/wecom/channel-config/${channelId}`).then(r => r.json()).catch(() => ({}));
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
      const res = await fetch(`/api/wecom/channel-config/${channelId}`, {
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
      fd.append("channel_type", channelType);
      fd.append("channel_id", String(channelId));
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
        body: JSON.stringify({ channel_type: channelType, channel_id: channelId, question: addQuestion || null, answer: addAnswer }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("添加成功"); setShowAddModal(false); setAddQuestion(""); setAddAnswer(""); loadData(); }
      else toast.error(d.error || "添加失败");
    } catch { toast.error("网络错误"); }
    finally { setSaving(false); }
  }

  async function handleDelete(sourceFile: string) {
    try {
      const res = await fetch(`/api/wecom/ch/kb/source?channel_id=${channelId}&source_file=${encodeURIComponent(sourceFile)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) { toast.success(`已删除 ${d.deleted} 条`); setDeleteConfirm(null); loadData(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
  }

  async function loadSourceItems(sourceFile: string) {
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/wecom/ch/kb/items?channel_id=${channelId}&source_file=${encodeURIComponent(sourceFile)}&limit=50`);
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
      {/* 第0步：AI智能整理 */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#C4A8E8', background: 'linear-gradient(135deg, #F5EEFF 0%, #EEF4FF 100%)' }}>
        <button
          onClick={() => setStep0Open(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.brand }}>
              <span className="text-white text-xs font-bold">0</span>
            </div>
            <span className="text-sm font-semibold" style={{ color: C.textMain }}>第0步· AI智能整理</span>
            <span className="text-xs rounded px-1.5 py-0.5" style={{ color: C.brand, backgroundColor: C.brandLight }}>推荐先做</span>
          </div>
          <ChevronRight className={`w-4 h-4 transition-transform ${step0Open ? 'rotate-90' : ''}`} style={{ color: C.textSub }} />
        </button>

        {step0Open && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid #C4A8E8' }}>
            <p className="text-xs pt-3 leading-relaxed" style={{ color: C.textSub }}>
              粘贴任意内容（产品介绍、客服要求、价格表等），AI 自动判断并分别写入「角色/行为规则」和「知识库」
            </p>
            <textarea
              value={step0Input}
              onChange={e => setStep0Input(e.target.value)}
              placeholder="例如：客服要有耕心，不要用太官方的语气。我们的产品康宝莱F1单一99元，包含蛋白粉和维生素套餐..."
              rows={5}
              className="w-full text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2"
              style={{ border: '1px solid #C4A8E8', color: C.textMain, backgroundColor: '#FDFBFF' }}
            />
            <button
              onClick={handleStep0Analyze}
              disabled={step0Analyzing || !step0Input.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: C.brand, color: '#fff' }}
            >
              {step0Analyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" />分析中...</>
                : <><Sparkles className="w-4 h-4" />让 AI 帮我整理</>}
            </button>

            {step0Result && (
              <div className="space-y-3">
                {step0Result.summary && (
                  <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ color: C.brandDeep, backgroundColor: C.brandLight }}>
                    <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{step0Result.summary}</span>
                  </div>
                )}

                {step0Result.prompt_additions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold flex items-center gap-1" style={{ color: C.textSub }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.brand }} />
                      建议写入「角色/行为规则」
                    </div>
                    {step0Result.prompt_additions.map((p, i) => (
                      <div key={i} className="rounded-lg border transition-all" style={step0SelPrompts[i] ? { borderColor: C.brand, backgroundColor: C.brandLight } : { borderColor: C.line, backgroundColor: C.white }}>
                        {step0EditPromptIdx === i ? (
                          <div className="p-2 space-y-2">
                            <textarea value={step0EditDraftPrompt} onChange={e => setStep0EditDraftPrompt(e.target.value)} rows={3} autoFocus className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none" style={{ border: '1px solid #7C3AED' }} />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditPromptIdx(null)} className="text-xs px-2 py-0.5 rounded" style={{ color: C.textSub }}>取消</button>
                              <button onClick={() => { const u=[...step0Result!.prompt_additions]; u[i]={...u[i], content: step0EditDraftPrompt}; setStep0Result({...step0Result!, prompt_additions: u}); setStep0EditPromptIdx(null); }} className="text-xs px-2 py-0.5 rounded" style={{ color: C.brand }}>保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelPrompts(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className="w-4 h-4 rounded border flex items-center justify-center" style={step0SelPrompts[i] ? { backgroundColor: C.brand, borderColor: C.brand } : { borderColor: C.line }}>
                                {step0SelPrompts[i] && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <div className="flex-1 text-xs">
                              {p.duplicate_check && p.duplicate_check !== 'new' && (
                                <div className="mb-1 px-1.5 py-0.5 rounded text-xs inline-flex items-center gap-1" style={{ backgroundColor: p.duplicate_check.startsWith('duplicate') ? '#FEF2F2' : '#FFFBEB', color: p.duplicate_check.startsWith('duplicate') ? '#DC2626' : '#D97706' }}>
                                  {p.duplicate_check.startsWith('duplicate') ? '⚠ 重复' : '~ 相似'}：{p.duplicate_check.replace(/^(duplicate|similar):/, '').split(',')[0]}
                                  {p.duplicate_check.includes(',') && <span style={{ color: '#6B7280' }}>（{p.duplicate_check.split(',').slice(1).join(',')}）</span>}
                                </div>
                              )}
                              <span className="whitespace-pre-wrap" style={{ color: step0SelPrompts[i] ? C.brandDeep : C.textSub }}>{p.content}</span>
                            </div>
                            <button onClick={() => { setStep0EditPromptIdx(i); setStep0EditDraftPrompt(p.content); }} className="flex-shrink-0" style={{ color: C.line }}>
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
                    <div className="text-xs font-semibold flex items-center gap-1" style={{ color: C.textSub }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.brand }} />
                      建议写入「知识库」
                    </div>
                    {step0Result.kb_items.map((item, i) => (
                      <div key={i} className="rounded-lg border transition-all" style={step0SelKbs[i] ? { borderColor: C.brand, backgroundColor: C.brandLight } : { borderColor: C.line, backgroundColor: C.white }}>
                        {step0EditKbIdx === i ? (
                          <div className="p-2 space-y-2">
                            <div>
                              <div className="text-xs mb-0.5" style={{ color: C.textSub }}>Q 问题</div>
                              <input value={step0EditDraftQ} onChange={e => setStep0EditDraftQ(e.target.value)} autoFocus className="w-full text-xs rounded px-2 py-1 focus:outline-none" style={{ border: `1px solid ${C.brand}` }} />
                            </div>
                            <div>
                              <div className="text-xs mb-0.5" style={{ color: C.textSub }}>A 答案</div>
                              <textarea value={step0EditDraftA} onChange={e => setStep0EditDraftA(e.target.value)} rows={3} className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none" style={{ border: `1px solid ${C.brand}` }} />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setStep0EditKbIdx(null)} className="text-xs px-2 py-0.5 rounded" style={{ color: C.textSub }}>取消</button>
                              <button onClick={() => { const u=[...step0Result!.kb_items]; u[i]={question:step0EditDraftQ,answer:step0EditDraftA}; setStep0Result({...step0Result!, kb_items: u}); setStep0EditKbIdx(null); }} className="text-xs px-2 py-0.5 rounded" style={{ color: C.brand }}>保存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => setStep0SelKbs(prev => { const n=[...prev]; n[i]=!n[i]; return n; })} className="flex-shrink-0 mt-0.5">
                              <div className="w-4 h-4 rounded border flex items-center justify-center" style={step0SelKbs[i] ? { backgroundColor: C.brand, borderColor: C.brand } : { borderColor: C.line }}>
                                {step0SelKbs[i] && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <div className="flex-1 text-xs">
                              {item.duplicate_check && item.duplicate_check !== 'new' && (
                                <div className="mb-1 px-1.5 py-0.5 rounded text-xs inline-flex items-center gap-1" style={{ backgroundColor: item.duplicate_check.startsWith('duplicate') ? '#FEF2F2' : '#FFFBEB', color: item.duplicate_check.startsWith('duplicate') ? '#DC2626' : '#D97706' }}>
                                  {item.duplicate_check.startsWith('duplicate') ? '⚠ 重复' : '~ 相似'}：{item.duplicate_check.replace(/^(duplicate|similar):/, '').split(',')[0]}
                                  {item.duplicate_check.includes(',') && <span style={{ color: '#6B7280' }}>（{item.duplicate_check.split(',').slice(1).join(',')}）</span>}
                                </div>
                              )}
                              <div className="font-medium" style={{ color: step0SelKbs[i] ? C.brandDeep : C.textMain }}>Q: {item.question}</div>
                              <div className="mt-0.5" style={{ color: step0SelKbs[i] ? C.brand : C.textSub }}>A: {item.answer}</div>
                            </div>
                            <button onClick={() => { setStep0EditKbIdx(i); setStep0EditDraftQ(item.question); setStep0EditDraftA(item.answer); }} className="flex-shrink-0" style={{ color: C.line }}>
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
                    style={{ backgroundColor: step0Done ? C.brand : C.textMain, color: '#fff' }}
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
                    body: JSON.stringify({ channel_type: channelType, channel_id: channelId, content: pasteText.trim() }),
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

      {/* 素材库 */}
      <MaterialsCard channelId={channelId} theme={theme} />

      {/* 我的数字分身卡片 */}
      <DigitalTwinCard channelId={String(channelId)} theme={theme} />

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
  channel_name?: string | null;
  channel_avatar?: string | null;
  manus_task_id?: string | null;
  dialog_score?: number | null;
  score_level?: string | null;
  score_reason?: string | null;
  score_dimensions?: {
    intent_clarity?: number;
    reply_quality?: number;
    completeness?: number;
    info_density?: number;
    emotion_handling?: number;
  } | null;
  score_at?: string | null;
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

function CustomerDataTab({ channelId = KF_CHANNEL_ID, channelType = KF_CHANNEL_TYPE, theme = C }: { channelId?: number; channelType?: string; theme?: typeof C } = {}) {
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
  // ── 评分状态 ──
  const [scoringId, setScoringId] = useState<number | null>(null); // 正在评分的logId
  const [adjustingId, setAdjustingId] = useState<number | null>(null); // 正在手动调整的logId
  const [adjustScore, setAdjustScore] = useState<number>(60);
  const PAGE_SIZE = 20;

  // 初始化：并行加载汇总 + 用户列表 + 静默触发批量打分
  useEffect(() => {
    Promise.all([
      fetch(`/api/wecom/ch/data/summary?channel_id=${channelId}&channel_type=${channelType}`).then(r => r.json()).catch(() => null),
      fetch(`/api/wecom/ch/users?channel_type=${channelType}`).then(r => r.json()).catch(() => null),
    ]).then(([sum, usersData]) => {
      if (sum?.ok) setSummary(sum);
      if (usersData?.ok) setAllUsers(usersData.users || []);
    });
    // 静默触发批量打分（给未打分的历史数据补分），打完后刷新列表
    fetch(`/api/wecom/ch/logs/auto-score-all`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.ok && d.scored > 0) fetchLogs(0); })
      .catch(() => {});
  }, []);

  function buildParams(p = 0) {
    const params = new URLSearchParams();
    params.set('channel_id', String(channelId));
    params.set('channel_type', channelType);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(p * PAGE_SIZE));
    const dr = getCdDateRange(timeRange);
    if (dr) { params.set('start_date', dr.start); params.set('end_date', dr.end); }
    if (filterUser) params.set('user_id', filterUser);
    if (filterModel) params.set('model', filterModel);
    return params;
  }

  async function fetchLogs(p = 0, retry = true) {
    setLoading(true);
    try {
      const params = buildParams(p);
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        // 解析 score_dimensions（MySQL JSON 字段可能是字符串）
        const parsedLogs = (data.logs || []).map((l: any) => ({
          ...l,
          score_dimensions: typeof l.score_dimensions === 'string' ? (() => { try { return JSON.parse(l.score_dimensions); } catch { return null; } })() : l.score_dimensions
        }));
        setLogs(parsedLogs); setTotal(data.total || 0); setPage(p);
      } else if (retry) {
        // 首次失败时静默重试一次（服务器初始化中可能暂时不可用）
        setTimeout(() => fetchLogs(p, false), 1500);
        return;
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      if (retry) {
        setTimeout(() => fetchLogs(p, false), 1500);
        return;
      }
      toast.error('网络错误');
    }
    finally { setLoading(false); }
  }

  // 筛选变化时自动重新请求
  useEffect(() => { fetchLogs(0); }, [timeRange, filterUser, filterModel]);

  // AI 自动评分
  async function handleScore(logId: number) {
    setScoringId(logId);
    try {
      const res = await fetch(`/api/wecom/ch/logs/${logId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, channel_type: channelType, avatar_role: '营养顾问，为用户提供专业的营养和健康咨询服务' })
      });
      const d = await res.json();
      if (d.ok) {
        const stars = d.stars ?? Math.round((d.score / 20) * 2) / 2;
        setLogs(prev => prev.map(l => l.id === logId ? { ...l, dialog_score: d.score, score_level: d.level, score_reason: d.reason, score_dimensions: d.dimensions } : l));
        toast.success(d.cached ? '评分已加载' : `评分完成：${stars}星`);
      } else toast.error(d.error || '评分失败');
    } catch { toast.error('评分失败'); }
    finally { setScoringId(null); }
  }

  // 手动调整评分
  async function handleAdjustScore(logId: number, score: number) {
    try {
      const res = await fetch(`/api/wecom/ch/logs/${logId}/score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, reason: '手动调整' })
      });
      const d = await res.json();
      if (d.ok) {
        setLogs(prev => prev.map(l => l.id === logId ? { ...l, dialog_score: d.score, score_level: d.level } : l));
        setAdjustingId(null);
        toast.success('评分已更新');
      } else toast.error(d.error || '更新失败');
    } catch { toast.error('更新失败'); }
  }

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
            { label: '总对话', value: summary.total_logs, color: theme.brand },
            { label: '总用户', value: summary.total_users, color: theme.textMain },
            { label: '本月对话', value: summary.month_logs, color: theme.brand },
            { label: '均积分/条', value: summary.avg_credits, color: theme.textSub },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center border shadow-sm" style={{ borderColor: theme.line }}>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: theme.textSub }}>{s.label}</div>
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
              ? { backgroundColor: theme.brandLight, borderColor: theme.brand, color: theme.brand }
              : { backgroundColor: theme.white, borderColor: theme.line, color: theme.textSub }}
          >
            <span>{timeLabels[timeRange]}</span>
            <ChevronRight className="w-3 h-3" style={{ transform: showTimeDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showTimeDD && (
            <div className="absolute top-10 left-0 z-30 rounded-xl shadow-lg w-32 py-1" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}>
              {(['all', 'today', 'week', 'month'] as CdTimeRange[]).map(v => (
                <button key={v} onClick={() => { setTimeRange(v); setShowTimeDD(false); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: timeRange === v ? theme.brand : theme.textMain, fontWeight: timeRange === v ? 600 : 400 }}
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
              ? { backgroundColor: theme.brandLight, borderColor: theme.brand, color: theme.brand }
              : { backgroundColor: theme.white, borderColor: theme.line, color: theme.textSub }}
          >
            <span className="truncate">{filterUser ? (allUsers.find(u => u.wecom_user_id === filterUser)?.nickname || filterUser.slice(0, 8)) : '全部用户'}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ transform: showUserDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showUserDD && (
            <div className="absolute top-10 left-0 z-30 rounded-xl shadow-lg w-52" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}>
              <div className="px-3 pt-2 pb-1">
                <input type="text" placeholder="搜索用户…" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                  style={{ border: `1px solid ${theme.line}` }} autoFocus />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                <button onClick={() => { setFilterUser(''); setShowUserDD(false); setUserSearch(''); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: !filterUser ? theme.brand : theme.textMain, fontWeight: !filterUser ? 600 : 400 }}>全部用户</button>
                {filteredUsers.map(u => (
                  <button key={u.wecom_user_id} onClick={() => { setFilterUser(u.wecom_user_id); setShowUserDD(false); setUserSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs truncate"
                    style={{ color: filterUser === u.wecom_user_id ? theme.brand : theme.textMain, fontWeight: filterUser === u.wecom_user_id ? 600 : 400 }}
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
              ? { backgroundColor: theme.brandLight, borderColor: theme.brand, color: theme.brand }
              : { backgroundColor: theme.white, borderColor: theme.line, color: theme.textSub }}
          >
            <span className="truncate">{filterModel ? filterModel.replace('deepseek-', 'DS-').replace('manus-1.6', 'M1.6') : '全部模型'}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ transform: showModelDD ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showModelDD && (
            <div className="absolute top-10 right-0 z-30 rounded-xl shadow-lg w-44 py-1" style={{ backgroundColor: theme.white, border: `1px solid ${theme.line}` }}>
              <button onClick={() => { setFilterModel(''); setShowModelDD(false); }}
                className="w-full text-left px-3 py-2 text-xs"
                style={{ color: !filterModel ? theme.brand : theme.textMain, fontWeight: !filterModel ? 600 : 400 }}>全部模型</button>
              {modelOptions.map(m => (
                <button key={m} onClick={() => { setFilterModel(m); setShowModelDD(false); }}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ color: filterModel === m ? theme.brand : theme.textMain, fontWeight: filterModel === m ? 600 : 400 }}
                >{m}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 记录数 + 刷新 ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: theme.textSub }}>共 {total} 条对话记录</span>
        <button onClick={() => fetchLogs(page)} className="p-1.5 rounded-lg" style={{ color: theme.brand }}><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* ── 聊天记录列表 ── */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.brand }} /></div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-2" style={{ color: theme.line }} />
          <div className="text-sm" style={{ color: theme.textSub }}>暂无对话记录</div>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: theme.line }}>
              <button className="w-full px-3 py-2 text-left"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                {/* 时间 + 用户名 + 展开按钮 */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] flex-shrink-0" style={{ color: theme.textSub }}>{formatDate(log.created_at)}</span>
                  <span className="text-[10px] truncate flex-1" style={{ color: theme.textSub }}>{log.nickname || log.wecom_user_id.slice(0, 12)}</span>
                  {expanded === log.id
                    ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: theme.textSub }} />
                    : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: theme.textSub }} />}
                </div>
                {/* 用户气泡：头像左侧，气泡内只显示纯内容 */}
                <div className="flex items-start gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.brandLight }}>
                    <User className="w-3 h-3" style={{ color: theme.brand }} />
                  </div>
                  <div className="rounded-2xl rounded-tl-none px-2.5 py-1.5 flex-1 min-w-0" style={{ backgroundColor: '#f0f0f0' }}>
                    <div className={`text-sm leading-snug ${expanded === log.id ? '' : 'line-clamp-1'}`} style={{ color: '#1a1a1a' }}>{log.user_message || '(无内容)'}</div>
                  </div>
                </div>
                {/* 分身气泡：头像右侧，不显示名字，气泡占满剩余宽度 */}
                {log.reply_preview && (
                  <div className="flex items-start gap-1.5 flex-row-reverse">
                    {log.channel_avatar ? (
                      <img src={log.channel_avatar} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.brand }}>
                        <span className="text-white" style={{ fontSize: '9px', fontWeight: 700 }}>分</span>
                      </div>
                    )}
                    <div className="rounded-2xl rounded-tr-none px-2.5 py-1.5 flex-1 min-w-0" style={{ backgroundColor: theme.brand }}>
                      <div className={`text-sm leading-snug ${expanded === log.id ? '' : 'line-clamp-1'}`} style={{ color: '#fff' }}>{log.reply_preview}</div>
                    </div>
                  </div>
                )}
              </button>
              {/* 卡片底部细线下方：始终可见 */}
              <div className="px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${theme.line}` }}>
                {/* 模型 + token + 星级（同一行） + 渠道 */}
                <div className="flex gap-2 text-xs flex-wrap items-center" style={{ color: theme.textSub }}>
                  {log.model_used && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.brandLight, color: theme.brand }}>{log.model_used}</span>}
                  {log.credits_used > 0 && <span>{log.credits_used} token</span>}
                  {/* 星级：跟在 token 后面，收窄显示 */}
                  {(() => {
                    if (log.dialog_score !== null && log.dialog_score !== undefined) {
                      const stars = Math.round((log.dialog_score / 20) * 2) / 2;
                      const fullStars = Math.floor(stars);
                      const hasHalf = stars - fullStars >= 0.5;
                      const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
                      const starColor = stars >= 4.5 ? '#16a34a' : stars >= 3.5 ? '#2563eb' : stars >= 2.5 ? '#d97706' : '#dc2626';
                      return (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: fullStars }).map((_, i) => (
                            <svg key={`f${i}`} className="w-3 h-3" viewBox="0 0 24 24" fill={starColor}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          ))}
                          {hasHalf && (
                            <svg className="w-3 h-3" viewBox="0 0 24 24">
                              <defs><linearGradient id={`hg${log.id}`}><stop offset="50%" stopColor={starColor}/><stop offset="50%" stopColor="#e5e7eb"/></linearGradient></defs>
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={`url(#hg${log.id})`}/>
                            </svg>
                          )}
                          {Array.from({ length: emptyStars }).map((_, i) => (
                            <svg key={`e${i}`} className="w-3 h-3" viewBox="0 0 24 24" fill="#e5e7eb"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          ))}
                          <span className="text-xs font-semibold ml-0.5" style={{ color: starColor }}>{stars.toFixed(1)}</span>
                        </div>
                      );
                    } else {
                      // 未打分：显示空星
                      return (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <svg key={i} className="w-3 h-3" viewBox="0 0 24 24" fill="#e5e7eb"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          ))}
                        </div>
                      );
                    }
                  })()}
                  {/* 渠道标签 */}
                  {(() => {
                    const chName = log.channel_name || (log.manus_task_id === 'kf-deepseek' ? '营养顾问' : null);
                    if (!chName) return null;
                    return (
                      <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        {chName}
                      </span>
                    );
                  })()}
                </div>
                {/* 展开后：总评 + 维度 + 调整 */}
                {expanded === log.id && log.dialog_score !== null && log.dialog_score !== undefined && (() => {
                  const stars = Math.round((log.dialog_score / 20) * 2) / 2;
                  const starColor = stars >= 4.5 ? '#16a34a' : stars >= 3.5 ? '#2563eb' : stars >= 2.5 ? '#d97706' : '#dc2626';
                  return (
                    <div className="space-y-2 mt-2 pt-2" style={{ borderTop: `1px solid ${theme.line}` }}>
                      {/* 等级标签 + 调整按钮 */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: stars >= 4.5 ? '#dcfce7' : stars >= 3.5 ? '#dbeafe' : stars >= 2.5 ? '#fef3c7' : '#fee2e2',
                            color: starColor
                          }}>
                          {stars >= 4.5 ? '极优' : stars >= 3.5 ? '良好' : stars >= 2.5 ? '一般' : stars >= 1.5 ? '较差' : '低质'}
                        </span>
                        <span className="text-xs" style={{ color: theme.textSub }}>训练语料</span>
                        <button onClick={e => { e.stopPropagation(); setAdjustingId(adjustingId === log.id ? null : log.id); setAdjustScore(log.dialog_score!); }}
                          className="text-xs px-2 py-0.5 rounded-lg border ml-auto" style={{ borderColor: theme.line, color: theme.textSub }}>
                          调整
                        </button>
                      </div>
                      {/* 总评 */}
                      {log.score_reason && (
                        <div className="text-xs px-2 py-1.5 rounded-lg" style={{ backgroundColor: theme.bg, color: theme.textSub }}>
                          {log.score_reason}
                        </div>
                      )}
                      {/* 维度详情 */}
                      {log.score_dimensions && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-xs font-medium mb-1" style={{ color: theme.textSub }}>评分维度详情</div>
                          {([
                            { key: 'intent_clarity', label: '意图清晰度', max: 20, desc: '用户意图是否清晰、AI是否准确理解' },
                            { key: 'reply_quality', label: '回复质量', max: 30, desc: '回复准确完整专业、有无错误信息' },
                            { key: 'completeness', label: '对话完整性', max: 20, desc: '问答闭环完整、用户问题得到解决' },
                            { key: 'info_density', label: '信息密度', max: 15, desc: '包含有价値的业务知识信息' },
                            { key: 'emotion_handling', label: '情感处理', max: 15, desc: '负面情绪或投诉时的处理是否得当' },
                          ] as const).map(dim => {
                            const val = (log.score_dimensions as any)?.[dim.key] ?? 0;
                            const pct = Math.round((val / dim.max) * 100);
                            const barColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#2563eb' : pct >= 40 ? '#d97706' : '#dc2626';
                            return (
                              <div key={dim.key}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <div>
                                    <span className="text-xs font-medium" style={{ color: theme.textMain }}>{dim.label}</span>
                                    <span className="text-xs ml-1" style={{ color: theme.textSub }}>({dim.desc})</span>
                                  </div>
                                  <span className="text-xs font-bold" style={{ color: barColor }}>{val}/{dim.max}</span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* 手动调整滑块 */}
                      {adjustingId === log.id && (
                        <div className="flex items-center gap-2 mt-1 pt-2" style={{ borderTop: `1px solid ${theme.line}` }}>
                          <span className="text-xs" style={{ color: theme.textSub }}>1星</span>
                          <input type="range" min={20} max={100} step={10} value={adjustScore}
                            onChange={e => setAdjustScore(Number(e.target.value))}
                            className="flex-1 h-1.5 rounded-full accent-green-600" />
                          <span className="text-xs" style={{ color: theme.textSub }}>5星</span>
                          <span className="text-sm font-bold w-12 text-center" style={{ color: theme.brand }}>
                            {(Math.round((adjustScore / 20) * 2) / 2).toFixed(1)}星
                          </span>
                          <button onClick={e => { e.stopPropagation(); handleAdjustScore(log.id, adjustScore); }}
                            className="text-xs px-3 py-1 rounded-lg text-white" style={{ backgroundColor: theme.brand }}>
                            确定
                          </button>
                          <button onClick={e => { e.stopPropagation(); setAdjustingId(null); }}
                            className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: theme.line, color: theme.textSub }}>
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ── 分页 ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => fetchLogs(page - 1)} disabled={page === 0 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: theme.line, color: theme.brand }}>上一页</button>
          <span className="text-sm" style={{ color: theme.textSub }}>{page + 1} / {totalPages}</span>
          <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages - 1 || loading}
            className="px-4 py-2 rounded-xl text-sm border disabled:opacity-40"
            style={{ borderColor: theme.line, color: theme.brand }}>下一页</button>
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
  const [refreshKey, setRefreshKey] = useState(0);

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
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-xs px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}
          >刷新</button>
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
        {activeTab === "aibrain" && <AIBrainTab refreshKey={refreshKey} />}
        {activeTab === "customers" && <CustomerDataTab />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 路由入口：按 slug 分发到对应项目
// ═══════════════════════════════════════════════════════════════
const MibanAppWrapper = React.lazy(() => import("../miban/MibanApp"));

export default function ProjectLanding() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  if (slug === "proj_69hzg9") {
    return <NutritionClubPage />;
  }

  if (slug === "proj_liulifan") {
    return <LiuLifanPage />;
  }

  if (slug === "proj_tizong") {
    return <WeightCoachPage />;
  }
  if (slug === "proj_hzxm2t") {
    // 米伴子项目
    return <MibanAppWrapper />;
  }

  // 其他 slug：占位页
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "#F7F4F2" }}>
      <div className="text-4xl font-bold text-gray-300 mb-3">{slug}</div>
      <div className="text-gray-500 text-sm">该项目页面正在建设中</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 刘力凡 · 奢贝美容院（粉色主题，channel_id=8）
// ═══════════════════════════════════════════════════════════════
const C_PINK = {
  brand: "#2196C8",
  brandDeep: "#1565A8",
  brandLight: "#E8F4FD",
  bg: "#F5FAFD",
  white: "#FFFFFF",
  textMain: "#1A2A36",
  textSub: "#5B7A90",
  line: "#D6EEFB",
} as const;

const KF_CHANNEL_ID_LLF = 8;
const KF_CHANNEL_TYPE_LLF = "kf";

export function LiuLifanPage({ onBack }: { onBack?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>("avatar");
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [channelName, setChannelName] = useState("刘力凡分身");
  const [channelAvatarUrl, setChannelAvatarUrl] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`/api/wecom/channels/${KF_CHANNEL_ID_LLF}`)
      .then(r => r.json())
      .then(ch => {
        if (ch && ch.name) setChannelName(ch.name);
        if (ch && ch.avatar_url) setChannelAvatarUrl(ch.avatar_url);
      })
      .catch(() => {});

    Promise.all([
      fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID_LLF}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).filter((r: any) => r.enabled).length : 0).catch(() => 0),
      fetch(`/api/wecom/custom-rules?channel_type=${KF_CHANNEL_TYPE_LLF}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).length : 0).catch(() => 0),
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID_LLF}`).then(r => r.json()).then(d => d.item_count || 0).catch(() => 0),
      fetch(`/api/wecom/ch/logs?channel_id=${KF_CHANNEL_ID_LLF}&channel_type=${KF_CHANNEL_TYPE_LLF}&limit=1`).then(r => r.json()).then(d => d.total || 0).catch(() => 0),
      fetch(`/api/wecom/corpus/stats?channel_id=${KF_CHANNEL_ID_LLF}`).then(r => r.json()).then(d => d.ok ? (d.quality_count || 0) : 0).catch(() => 0),
    ]).then(([config, rules, aibrain, customers, corpusQuality]) => {
      const avatarScore = aibrain * 1 + corpusQuality * 3 + customers * 0.5;
      let avatarLevel = 1;
      const lvThresholds = [0, 100, 300, 700, 1500, 3000];
      for (let i = lvThresholds.length - 1; i >= 0; i--) { if (avatarScore >= lvThresholds[i]) { avatarLevel = i + 1; break; } }
      setTabCounts({ config, rules, aibrain, customers, avatar: avatarLevel });
    });
  }, []);

  // 用粉色主题覆盖全局 C，通过内联 style 传递
  const CP = C_PINK;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: CP.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      <header className="sticky top-0 z-10" style={{ background: `linear-gradient(135deg, #1565A8 0%, #2196C8 60%, #4DB8E8 100%)` }}>
        <div className="flex items-center justify-between px-4" style={{ height: 52 }}>
          <button onClick={() => onBack ? onBack() : window.history.back()} className="p-1.5 rounded-full" style={{ color: "rgba(255,255,255,0.8)" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-bold tracking-wide text-white leading-tight">数字分身 · {channelName}</div>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}>刷新</button>
        </div>
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              {channelAvatarUrl ? <img src={channelAvatarUrl} alt="分身" className="w-full h-full object-cover" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div>
              <div className="text-white text-[13px] font-semibold leading-tight">{channelName}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-[116px] z-10" style={{ backgroundColor: CP.bg, borderBottom: `1px solid ${CP.line}` }}>
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs py-2.5 px-1 font-medium transition-colors"
              style={{
                ...(activeTab === t.key ? { color: CP.brand, borderBottom: `2px solid ${CP.brand}` } : { color: CP.textSub, borderBottom: '2px solid transparent' }),
                borderRight: t.key !== 'customers' ? `1px solid ${CP.line}` : 'none',
                fontSize: t.key === 'aibrain' ? 11 : undefined,
                minWidth: t.key === 'aibrain' ? 70 : undefined,
              }}
            >
              <span>{t.label}</span>
              <span className="text-[11px] leading-none font-semibold px-1.5 py-0.5 rounded-full mt-0.5"
                style={activeTab === t.key ? { backgroundColor: CP.brandLight, color: CP.brand } : { backgroundColor: 'rgba(0,0,0,0.06)', color: CP.textSub }}>
                {t.key === 'avatar'
                  ? (() => { const eq = (tabCounts['aibrain'] || 0) + (tabCounts['customers'] || 0) * 0.1; const pct = Math.min(100, Math.round((eq / 10000) * 100)); return `${pct}%`; })()
                  : (tabCounts[t.key] !== undefined ? tabCounts[t.key] : '-')}
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 pt-2">
        {activeTab === "avatar" && <AvatarGrowthTab onProfileUpdate={(name, url) => { setChannelName(name); setChannelAvatarUrl(url); }} channelId={KF_CHANNEL_ID_LLF} channelType={KF_CHANNEL_TYPE_LLF} theme={C_PINK} />}
        {activeTab === "config" && <ConfigTab onProfileUpdate={(name, avatarUrl) => { setChannelName(name); setChannelAvatarUrl(avatarUrl); }} channelId={KF_CHANNEL_ID_LLF} channelType={KF_CHANNEL_TYPE_LLF} theme={C_PINK} />}
        {activeTab === "aibrain" && <AIBrainTab refreshKey={refreshKey} channelId={KF_CHANNEL_ID_LLF} channelType={KF_CHANNEL_TYPE_LLF} theme={C_PINK} />}
        {activeTab === "customers" && <CustomerDataTab channelId={KF_CHANNEL_ID_LLF} channelType={KF_CHANNEL_TYPE_LLF} theme={C_PINK} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 体重管理教练（蓝色主题，channel_id=4）
// ═══════════════════════════════════════════════════════════════
const C_BLUE = {
  brand: "#1976D2",
  brandDeep: "#0D47A1",
  brandLight: "#E3F2FD",
  bg: "#F5F9FF",
  white: "#FFFFFF",
  textMain: "#1A2233",
  textSub: "#5B7A9D",
  line: "#BBDEFB",
} as const;

const KF_CHANNEL_ID_TZ = 4;
const KF_CHANNEL_TYPE_TZ = "kf";

export function WeightCoachPage({ onBack }: { onBack?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>("avatar");
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [channelName, setChannelName] = useState("体重管理教练");
  const [channelAvatarUrl, setChannelAvatarUrl] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`/api/wecom/channels/${KF_CHANNEL_ID_TZ}`)
      .then(r => r.json())
      .then(ch => {
        if (ch && ch.name) setChannelName(ch.name);
        if (ch && ch.avatar_url) setChannelAvatarUrl(ch.avatar_url);
      })
      .catch(() => {});

    Promise.all([
      fetch(`/api/wecom/prompt-rules?channel_id=${KF_CHANNEL_ID_TZ}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).filter((r: any) => r.enabled).length : 0).catch(() => 0),
      fetch(`/api/wecom/custom-rules?channel_type=${KF_CHANNEL_TYPE_TZ}`).then(r => r.json()).then(d => d.ok ? (d.rules || []).length : 0).catch(() => 0),
      fetch(`/api/wecom/ch/kb/stats?channel_id=${KF_CHANNEL_ID_TZ}`).then(r => r.json()).then(d => d.item_count || 0).catch(() => 0),
      fetch(`/api/wecom/ch/logs?channel_id=${KF_CHANNEL_ID_TZ}&channel_type=${KF_CHANNEL_TYPE_TZ}&limit=1`).then(r => r.json()).then(d => d.total || 0).catch(() => 0),
      fetch(`/api/wecom/corpus/stats?channel_id=${KF_CHANNEL_ID_TZ}`).then(r => r.json()).then(d => d.ok ? (d.quality_count || 0) : 0).catch(() => 0),
    ]).then(([config, rules, aibrain, customers, corpusQuality]) => {
      const avatarScore = aibrain * 1 + corpusQuality * 3 + customers * 0.5;
      let avatarLevel = 1;
      const lvThresholds = [0, 100, 300, 700, 1500, 3000];
      for (let i = lvThresholds.length - 1; i >= 0; i--) { if (avatarScore >= lvThresholds[i]) { avatarLevel = i + 1; break; } }
      setTabCounts({ config, rules, aibrain, customers, avatar: avatarLevel });
    });
  }, []);

  const CB = C_BLUE;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: CB.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      <header className="sticky top-0 z-10" style={{ background: `linear-gradient(135deg,${CB.brandDeep} 0%,${CB.brand} 100%)` }}>
        <div className="flex items-center justify-between px-4" style={{ height: 52 }}>
          <button onClick={() => onBack ? onBack() : window.history.back()} className="p-1.5 rounded-full" style={{ color: "rgba(255,255,255,0.8)" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-bold tracking-wide text-white leading-tight">数字分身 · {channelName}</div>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}>刷新</button>
        </div>
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              {channelAvatarUrl ? <img src={channelAvatarUrl} alt="分身" className="w-full h-full object-cover" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div>
              <div className="text-white text-[13px] font-semibold leading-tight">{channelName}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-[116px] z-10" style={{ backgroundColor: CB.bg, borderBottom: `1px solid ${CB.line}` }}>
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs py-2.5 px-1 font-medium transition-colors"
              style={{
                ...(activeTab === t.key ? { color: CB.brand, borderBottom: `2px solid ${CB.brand}` } : { color: CB.textSub, borderBottom: '2px solid transparent' }),
                borderRight: t.key !== 'customers' ? `1px solid ${CB.line}` : 'none',
                fontSize: t.key === 'aibrain' ? 11 : undefined,
                minWidth: t.key === 'aibrain' ? 70 : undefined,
              }}
            >
              <span>{t.label}</span>
              <span className="text-[11px] leading-none font-semibold px-1.5 py-0.5 rounded-full mt-0.5"
                style={activeTab === t.key ? { backgroundColor: CB.brandLight, color: CB.brand } : { backgroundColor: 'rgba(0,0,0,0.06)', color: CB.textSub }}>
                {t.key === 'avatar'
                  ? (() => { const eq = (tabCounts['aibrain'] || 0) + (tabCounts['customers'] || 0) * 0.1; const pct = Math.min(100, Math.round((eq / 10000) * 100)); return `${pct}%`; })()
                  : (tabCounts[t.key] !== undefined ? tabCounts[t.key] : '-')}
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 pt-2">
        {activeTab === "avatar" && <AvatarGrowthTab onProfileUpdate={(name, url) => { setChannelName(name); setChannelAvatarUrl(url); }} channelId={KF_CHANNEL_ID_TZ} channelType={KF_CHANNEL_TYPE_TZ} theme={C_BLUE} />}
        {activeTab === "config" && <ConfigTab onProfileUpdate={(name, avatarUrl) => { setChannelName(name); setChannelAvatarUrl(avatarUrl); }} channelId={KF_CHANNEL_ID_TZ} channelType={KF_CHANNEL_TYPE_TZ} theme={C_BLUE} />}
        {activeTab === "aibrain" && <AIBrainTab refreshKey={refreshKey} channelId={KF_CHANNEL_ID_TZ} channelType={KF_CHANNEL_TYPE_TZ} theme={C_BLUE} />}
        {activeTab === "customers" && <CustomerDataTab channelId={KF_CHANNEL_ID_TZ} channelType={KF_CHANNEL_TYPE_TZ} theme={C_BLUE} />}
      </main>
    </div>
  );
}
