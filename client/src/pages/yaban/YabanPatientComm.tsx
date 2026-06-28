/**
 * 牙伴齿科 - 患者沟通记录（智能时间线）
 * 三渠道：AI 语音秘书（录音转写）/ 手动输入 / 微信聊天记录
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
  X,
  Check,
  Pause,
  Play,
  RefreshCw,
  Pencil,
  Clock,
  Wand2,
  Search,
  Copy,
} from "lucide-react";

// ---- 类型定义 ----
interface CommRecord {
  id: number;
  customer_id: number;
  record_type: "voice" | "text" | "manual";
  raw_text: string | null;
  audio_url: string | null;
  summary_demand: string | null;
  summary_hospital: string | null;
  summary_key_points: string | null;
  summary_followup: string | null;
  summary_remark: string | null;
  ai_generated: number;
  operator_name: string | null;
  comm_at: string;
}

type RecordingState = "idle" | "countdown" | "recording" | "paused" | "analyzing";
type InputMode = "none" | "voice" | "manual" | "wechat_view";

// ---- 工具函数 ----
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCommAt(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${mi}`;
}

function formatCommDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}年${mo}月${day}日`;
}

// ---- 渠道配置 ----
const CHANNEL_CONFIG = {
  voice: {
    label: "AI 语音秘书",
    dotColor: "bg-blue-500",
    tagClass: "text-blue-600 bg-blue-50",
    icon: <Mic size={10} />,
  },
  text: {
    label: "微信聊天",
    dotColor: "bg-green-500",
    tagClass: "text-green-700 bg-green-50",
    icon: <MessageSquare size={10} />,
  },
  manual: {
    label: "手动录入",
    dotColor: "bg-gray-400",
    tagClass: "text-gray-500 bg-gray-100",
    icon: <Pencil size={10} />,
  },
};

// ---- AI 分析结果确认弹窗 ----
interface AnalysisResult {
  rawText: string;
  audioUrl: string | null;
  summaryItems: string[]; // 业务摘要条目数组
  // 兼容旧字段
  summaryDemand?: string;
  summaryHospital?: string;
  summaryKeyPoints?: string;
  summaryFollowup?: string;
  summaryRemark?: string;
}

function AnalysisConfirmModal({
  result,
  title,
  onConfirm,
  onCancel,
}: {
  result: AnalysisResult;
  title?: string;
  onConfirm: (data: AnalysisResult) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<string[]>(result.summaryItems || []);
  const [showRaw, setShowRaw] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }).catch(() => {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const handleCopyAll = () => {
    const text = items.filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(-1);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full bg-white rounded-t-2xl max-h-[88vh] flex flex-col">
        {/* 顶部蓝色标题栏 */}
        <div className="bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-3 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-white/80" />
            <span className="text-base font-semibold text-white">{title || "AI 分析结果"}</span>
          </div>
          <button onClick={onCancel} className="p-1 text-white/70"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* 原始转写内容（默认展开） */}
          {result.rawText && (
            <div>
              <button
                className="flex items-center justify-between w-full text-xs text-gray-400 mb-1.5"
                onClick={() => setShowRaw(!showRaw)}
              >
                <span className="flex items-center gap-1">
                  {showRaw ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  原始转写内容
                </span>
                <span className="text-sky-400 font-medium">本次内容记录了 {result.rawText.replace(/\s/g, '').length} 字</span>
              </button>
              {showRaw && (
                <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed max-h-40 overflow-y-auto">
                  {result.rawText}
                </div>
              )}
            </div>
          )}
          {/* 业务摘要条目 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-sky-500 font-medium">内容摘要</span>
              {items.length > 0 && (
                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-sky-500"
                >
                  <Copy size={11} />
                  {copiedIdx === -1 ? '已全部复制' : '全部复制'}
                </button>
              )}
            </div>
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-sky-400 font-bold flex-shrink-0 mt-0.5">{idx + 1}.</span>
                    <input
                      className="flex-1 text-sm text-gray-900 bg-transparent outline-none"
                      value={item}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = e.target.value;
                        setItems(next);
                      }}
                    />
                    <button
                      onClick={() => handleCopy(item, idx)}
                      className="flex-shrink-0 p-1 text-gray-300 hover:text-sky-500"
                    >
                      {copiedIdx === idx ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">未提取到业务相关内容</p>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm({ ...result, summaryItems: items })}
            className="flex-1 py-3 rounded-xl bg-sky-500 text-white text-sm font-medium"
          >
            保存记录
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 手动录入弹窗 ----
function ManualInputModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (data: Omit<AnalysisResult, "audioUrl">) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState({
    rawText: "",
    summaryDemand: "",
    summaryHospital: "",
    summaryKeyPoints: "",
    summaryFollowup: "",
    summaryRemark: "",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full bg-white rounded-t-2xl max-h-[88vh] flex flex-col">
        <div className="bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-3 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-white/80" />
            <span className="text-base font-semibold text-white">手动录入</span>
          </div>
          <button onClick={onCancel} className="p-1 text-white/70"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {[
            { key: "summaryDemand" as const, label: "记录摘要", placeholder: "客户提到的问题、需求..." },
            { key: "summaryHospital" as const, label: "医院记录", placeholder: "医生建议、诊断、方案..." },
            { key: "summaryKeyPoints" as const, label: "沟通要点", placeholder: "本次沟通的其他要点..." },
            { key: "summaryFollowup" as const, label: "跟进事项", placeholder: "下次联系时间、待办事项..." },
            { key: "summaryRemark" as const, label: "备注", placeholder: "其他补充信息..." },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-sky-500 font-medium mb-1">{label}</label>
              <textarea
                className="w-full text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 outline-none focus:border-sky-300 resize-none min-h-[56px]"
                value={data[key]}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">取消</button>
          <button
            onClick={() => onConfirm({ ...data, rawText: "", summaryItems: [] })}
            className="flex-1 py-3 rounded-xl bg-sky-500 text-white text-sm font-medium"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 客户聊天记录查看弹窗 ----
function CustomerChatViewModal({
  customerId,
  patientName,
  onClose,
}: {
  customerId: number;
  patientName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.yabanCustomer.getCustomerChatHistory.useQuery(
    { customerId, page: 1, page_size: 50 },
    { enabled: customerId > 0, refetchOnWindowFocus: false }
  );
  const messages = data?.messages || [];
  const hasAccount = data?.hasAccount ?? false;
  const total = data?.total ?? 0;

  function formatMsgTime(dateStr: string) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mo}/${day} ${h}:${mi}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-green-600 to-green-500 text-white flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onClose} className="p-1 text-white/80">
          <ChevronLeft size={26} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-base font-bold leading-tight">微信聊天记录</span>
          {patientName && (
            <span className="text-[11px] text-white/80 mt-0.5">{patientName}</span>
          )}
        </div>
        <span className="w-8" />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="text-green-500 animate-spin" />
          </div>
        ) : !hasAccount ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-3">
            <MessageSquare size={40} className="text-gray-200" />
            <p className="text-sm">该客户尚未绑定牙伴账号</p>
            <p className="text-xs text-gray-300">绑定账号后，AI 聊天记录将自动同步到此处</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-3">
            <MessageSquare size={40} className="text-gray-200" />
            <p className="text-sm">暂无聊天记录</p>
            <p className="text-xs text-gray-300">客户与 AI 助手的对话将显示在这里</p>
          </div>
        ) : (
          <>
            {/* 总条数提示 */}
            <div className="text-center">
              <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                共 {total} 条对话记录
              </span>
            </div>
            {/* 对话卡片列表 */}
            {messages.map((msg: any) => (
              <div key={msg.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* 时间 */}
                <div className="px-3 pt-2.5 pb-1">
                  <span className="text-[10px] text-gray-400">{formatMsgTime(msg.created_at)}</span>
                </div>
                {/* 用户气泡 */}
                <div className="px-3 pb-2">
                  <div className="flex items-start gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600" style={{ fontSize: '10px', fontWeight: 700 }}>客</span>
                    </div>
                    <div className="rounded-2xl rounded-tl-none px-2.5 py-1.5 flex-1 min-w-0 bg-gray-100">
                      <p className="text-sm text-gray-900 leading-snug">{msg.user_message || '(无内容)'}</p>
                    </div>
                  </div>
                </div>
                {/* AI 回复气泡 */}
                {msg.reply_preview && (
                  <div className="px-3 pb-2.5">
                    <div className="flex items-start gap-1.5 flex-row-reverse">
                      <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white" style={{ fontSize: '9px', fontWeight: 700 }}>AI</span>
                      </div>
                      <div className="rounded-2xl rounded-tr-none px-2.5 py-1.5 flex-1 min-w-0 bg-green-600">
                        <p className="text-sm text-white leading-snug">{msg.reply_preview}</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* 底部：模型标签 */}
                {msg.model_used && (
                  <div className="px-3 pb-2.5 border-t border-gray-50 pt-1.5">
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{msg.model_used}</span>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---- 单条时间线记录卡片 ----
// 摘要条目行：显示序号+文字+复制按钮
function SummaryItemRow({ index, text }: { index: number; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-xs text-sky-400 font-bold flex-shrink-0 w-4">{index + 1}.</span>
      <p className="flex-1 text-sm text-gray-800 leading-snug">{text}</p>
      <button
        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
        className="flex-shrink-0 p-1 text-gray-300 hover:text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function TimelineCard({
  record,
  onDelete,
  patientId,
}: {
  record: CommRecord;
  onDelete: (id: number) => void;
  patientId: number;
}) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const ch = CHANNEL_CONFIG[record.record_type] || CHANNEL_CONFIG.manual;

  // 解析摘要条目：优先用 summary_key_points 按 \n 分割，否则兼容旧字段
  const summaryItems: string[] = (() => {
    if (record.summary_key_points) {
      const lines = record.summary_key_points.split("\n").filter(Boolean);
      if (lines.length > 0) return lines;
    }
    // 旧格式兼容
    return [
      record.summary_demand,
      record.summary_hospital,
      record.summary_key_points,
      record.summary_followup,
      record.summary_remark,
    ].filter(Boolean) as string[];
  })();

  const firstSummary = summaryItems[0] || "";

  // 是否有语音档案
  const hasVoice = !!(record.audio_url || (record.record_type === "voice" && record.raw_text));
  // 是否有文字档案
  const hasText = !!(record.raw_text && record.record_type !== "voice") || record.record_type === "manual" || record.record_type === "text";

  return (
    <div className="flex gap-3">
      {/* 左侧时间线 */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className={`w-2.5 h-2.5 rounded-full ${ch.dotColor} flex-shrink-0`} />
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>

      {/* 右侧卡片 */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">

        {/* 头部：点击整行展开/收起 */}
        <button
          className="w-full flex items-center justify-between px-3 pt-3 pb-2.5 text-left"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${ch.tagClass}`}>
              {ch.icon}
              {ch.label}
            </span>
            {record.ai_generated === 1 && (
              <span className="text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full flex-shrink-0">AI</span>
            )}
            {!open && firstSummary && (
              <span className="text-xs text-gray-500 truncate ml-1">{firstSummary}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs text-gray-400">{formatCommAt(record.comm_at)}</span>
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>

        {/* 展开内容 */}
        {open && (
          <>
            {/* 摘要条目区 */}
            <div className="border-t border-gray-50 px-3 pt-2.5 pb-3">
              {summaryItems.length > 0 ? (
                <div className="space-y-1.5">
                  {summaryItems.map((item, idx) => (
                    <SummaryItemRow key={idx} index={idx} text={item} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">暂无摘要内容</p>
              )}
            </div>

            {/* 底部一行：三个档案入口 + 删除 */}
            <div className="px-3 py-2.5 border-t border-gray-50 flex items-center justify-between">
              {/* 左侧：三个档案图标入口 */}
              <div className="flex items-center gap-4">
                {/* 语音档案 */}
                <button
                  onClick={(e) => { e.stopPropagation(); /* TODO: 语音详情页 */ }}
                  className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                >
                  <Mic size={14} />
                  <span className="text-xs">语音档案</span>
                </button>
                {/* 文字档案 */}
                <button
                  onClick={(e) => { e.stopPropagation(); /* TODO: 文字详情页 */ }}
                  className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                >
                  <FileText size={14} />
                  <span className="text-xs">文字档案</span>
                </button>
                {/* 图像档案 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/yaban/patient/${patientId}/media`);
                  }}
                  className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                >
                  <ImageIcon size={14} />
                  <span className="text-xs">图像档案</span>
                </button>
              </div>
              {/* 右侧：删除 */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400"
              >
                <Trash2 size={12} />删除
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- 主页面 ----
export default function YabanPatientComm() {
  const [, params] = useRoute("/yaban/patient/:id/comm");
  const [, navigate] = useLocation();
  const patientId = params?.id ? Number(params.id) : 0;
  const { currentTenantId } = useYabanClinic();

  // 录音状态
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisTitle, setAnalysisTitle] = useState("AI 分析结果");
  const [analysisRecordType, setAnalysisRecordType] = useState<"voice" | "text" | "manual">("voice");

  // 搜索
  const [searchQuery, setSearchQuery] = useState("");

  // 输入模式
  const [inputMode, setInputMode] = useState<InputMode>("none");

  // 待处理录音（分析失败时保留）
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [pendingBlobUrl, setPendingBlobUrl] = useState<string | null>(null);

  // 录音相关 ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 患者信息
  const patientQuery = trpc.yabanCustomer.detail.useQuery(
    { id: patientId },
    { enabled: patientId > 0, refetchOnWindowFocus: false }
  );
  const patientName = (patientQuery.data as any)?.name || "";

  // 数据查询
  const { data, refetch, isLoading } = trpc.yabanComm.list.useQuery(
    { customerId: patientId },
    { enabled: patientId > 0 }
  );
  const records: CommRecord[] = (data?.records as CommRecord[]) || [];

  // mutations
  const createMutation = trpc.yabanComm.create.useMutation({
    onSuccess: () => { refetch(); toast.success("沟通记录已保存"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.yabanComm.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const clearPending = useCallback(() => {
    if (pendingBlobUrl) URL.revokeObjectURL(pendingBlobUrl);
    setPendingBlob(null);
    setPendingDuration(0);
    setPendingBlobUrl(null);
  }, [pendingBlobUrl]);

  // ---- 录音控制 ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // 先进入倒计时状态
      setRecordingState("countdown");
      setCountdown(3);
      setInputMode("voice");
      let count = 3;
      const cdInterval = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(cdInterval);
          // 倒计时结束，正式开始录音
          const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
          const recorder = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          recorder.start(1000);
          setRecordingState("recording");
          timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        } else {
          setCountdown(count);
        }
      }, 1000);
    } catch {
      toast.error("无法访问麦克风，请检查权限设置");
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingState("paused");
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      setRecordingState("recording");
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    audioChunksRef.current = [];
    setRecordingState("idle");
    setDuration(0);
    setInputMode("none");
  }, []);

  // ---- 语音分析（FormData 上传） ----
  const doAnalyze = useCallback(async (blob: Blob, mimeType: string, savedDuration: number) => {
    const fallbackToPending = () => {
      const url = URL.createObjectURL(blob);
      setPendingBlob(blob);
      setPendingDuration(savedDuration);
      setPendingBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setRecordingState("idle");
      setDuration(0);
      setInputMode("none");
      audioChunksRef.current = [];
    };
    try {
      if (blob.size === 0) { toast.error("录音文件为空，请重新录音"); fallbackToPending(); return; }
      const formData = new FormData();
      const ext = mimeType.includes("mp4") || mimeType.includes("webm") ? "mp4" : "webm";
      formData.append("audio", blob, `recording.${ext}`);
      formData.append("customerId", String(patientId));
      formData.append("mimeType", mimeType);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      let resp: Response;
      try {
        resp = await fetch("/api/yaban/analyze-voice-upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
          headers: { ...(currentTenantId ? { "x-yaban-tenant": String(currentTenantId) } : {}) },
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      setAnalysisTitle("AI 语音分析结果");
      setAnalysisRecordType("voice");
      // 将 summaryKeyPoints 按 \n 分割成数组，兼容旧格式
      const rawItems: string[] = result.summaryKeyPoints
        ? result.summaryKeyPoints.split("\n").filter(Boolean)
        : [];
      setAnalysisResult({
        rawText: result.rawText,
        audioUrl: result.audioUrl || null,
        summaryItems: rawItems,
        summaryDemand: result.summaryDemand,
        summaryHospital: result.summaryHospital || "",
        summaryKeyPoints: result.summaryKeyPoints,
        summaryFollowup: result.summaryFollowup,
        summaryRemark: result.summaryRemark,
      });
      setPendingBlob(null);
      setPendingDuration(0);
      setPendingBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setRecordingState("idle");
      setDuration(0);
      setInputMode("none");
      audioChunksRef.current = [];
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "分析超时（120秒），请重试" : (err?.message || "请重试");
      toast.error(`分析失败：${msg}`);
      fallbackToPending();
    }
  }, [patientId, currentTenantId]);

  const stopAndAnalyze = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (duration < 2) { toast.error("录音太短，请至少录制 2 秒后再停止"); cancelRecording(); return; }
    const recorder = mediaRecorderRef.current;
    const savedDuration = duration;
    setRecordingState("analyzing");
    recorder.onstop = async () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      await new Promise((resolve) => setTimeout(resolve, 500));
      const mimeType = recorder.mimeType || "audio/mp4";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      await doAnalyze(blob, mimeType, savedDuration);
    };
    try { recorder.requestData(); } catch (_) { /* 部分浏览器不支持 */ }
    recorder.stop();
  }, [duration, doAnalyze, cancelRecording]);

  const reanalyzeBlob = useCallback(async () => {
    if (!pendingBlob) return;
    setRecordingState("analyzing");
    const mimeType = pendingBlob.type || "audio/mp4";
    await doAnalyze(pendingBlob, mimeType, pendingDuration);
  }, [pendingBlob, pendingDuration, doAnalyze]);

  // ---- 保存记录 ----
  const handleConfirmAnalysis = useCallback(
    (data: AnalysisResult) => {
      // 新格式：将 summaryItems 数组用 \n 拼接存入 summaryKeyPoints
      const keyPoints = data.summaryItems && data.summaryItems.length > 0
        ? data.summaryItems.filter(Boolean).join("\n")
        : (data.summaryKeyPoints || "");
      createMutation.mutate({
        customerId: patientId,
        recordType: analysisRecordType,
        rawText: data.rawText,
        audioUrl: data.audioUrl || undefined,
        summaryDemand: data.summaryDemand || "",
        summaryHospital: data.summaryHospital || "",
        summaryKeyPoints: keyPoints,
        summaryFollowup: data.summaryFollowup || "",
        summaryRemark: data.summaryRemark || "",
        aiGenerated: analysisRecordType !== "manual",
        commAt: new Date().toISOString(),
      });
      setAnalysisResult(null);
    },
    [patientId, createMutation, analysisRecordType]
  );

  const handleConfirmManual = useCallback(
    (data: Omit<AnalysisResult, "audioUrl">) => {
      createMutation.mutate({
        customerId: patientId,
        recordType: "manual",
        summaryDemand: data.summaryDemand,
        summaryHospital: (data as any).summaryHospital || "",
        summaryKeyPoints: data.summaryKeyPoints,
        summaryFollowup: data.summaryFollowup,
        summaryRemark: data.summaryRemark,
        aiGenerated: false,
        commAt: new Date().toISOString(),
      });
      setInputMode("none");
    },
    [patientId, createMutation]
  );

  const handleDelete = useCallback(
    (id: number) => {
      if (confirm("确认删除这条沟通记录？")) deleteMutation.mutate({ id });
    },
    [deleteMutation]
  );

  // ---- 搜索过滤 ----
  const filteredRecords = searchQuery.trim()
    ? records.filter((r) => {
        const q = searchQuery.trim().toLowerCase();
        return [
          r.summary_demand,
          r.summary_key_points,
          r.summary_followup,
          r.summary_remark,
          r.raw_text,
          r.operator_name,
        ]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q));
      })
    : records;

  // ---- 按日期分组 ----
  const groupedRecords = filteredRecords.reduce<{ date: string; items: CommRecord[] }[]>((acc, r) => {
    const date = formatCommDate(r.comm_at);
    const last = acc[acc.length - 1];
    if (last && last.date === date) {
      last.items.push(r);
    } else {
      acc.push({ date, items: [r] });
    }
    return acc;
  }, []);

  // ---- 录音控制区 ----
  const renderVoiceControls = () => {
    if (recordingState === "analyzing") {
      return (
        <div className="bg-sky-50 rounded-2xl px-4 py-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="text-sky-500 animate-spin flex-shrink-0" />
            <p className="text-sm text-sky-500 font-medium">AI 秘书正在转写并提取要点</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-xs text-gray-400">AI 秘书处理中，请稍候...</p>
        </div>
      );
    }
    if (recordingState === "idle") return null;

    // 倒计时界面
    if (recordingState === "countdown") {
      return (
        <div className="bg-sky-50 rounded-2xl p-6 flex flex-col items-center gap-3">
          <p className="text-sm text-sky-500 font-medium">AI 秘书召唤中...</p>
          <span className="text-7xl font-bold text-sky-500 tabular-nums" style={{ lineHeight: 1 }}>{countdown}</span>
          <button onClick={cancelRecording} className="mt-2 text-xs text-gray-400 underline">取消</button>
        </div>
      );
    }

    return (
      <div className="bg-sky-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-center gap-3">
          {recordingState === "recording" ? (
            <span className="flex items-center gap-2 text-sky-600 font-semibold text-base">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              AI秘书记录中
            </span>
          ) : (
            <span className="flex items-center gap-2 text-gray-500 font-semibold text-base">
              <Pause size={14} />
              已暂停
            </span>
          )}
          <span className="text-sm font-mono text-gray-400 tabular-nums">{formatDuration(duration)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={cancelRecording} className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm">
            <X size={13} />取消
          </button>
          {recordingState === "recording" ? (
            <button onClick={pauseRecording} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sky-600 text-sm font-medium">
              <Pause size={13} />暂停
            </button>
          ) : (
            <button onClick={resumeRecording} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sky-600 text-sm font-medium">
              <Play size={13} />继续
            </button>
          )}
          <button onClick={stopAndAnalyze} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium">
            <Check size={13} />结束并整理
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 - 牙伴蓝色渐变风格 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${patientId}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">沟通记录</span>
            {patientName && (
              <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">{patientName}</span>
            )}
          </div>
          <span className="w-8" />
        </div>
      </div>

      {/* 搜索框 */}
      <div className="bg-gray-50 px-4 py-2.5">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-gray-200 shadow-sm">
          <Search size={15} className="text-sky-400 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索沟通记录内容..."
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="p-0.5 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 汇总档案卡片区 */}
      <div className="bg-gray-50 px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          {/* 语音档案汇总 */}
          <button
            className="flex flex-col items-center gap-1 bg-white rounded-xl py-3 border border-gray-100 shadow-sm active:bg-sky-50"
            onClick={() => {}}
          >
            <Mic size={18} className="text-sky-500" />
            <span className="text-xs font-medium text-gray-700">语音档案</span>
            <span className="text-xs text-gray-400">
              {records.filter((r) => r.record_type === "voice").length} 条
            </span>
          </button>
          {/* 文字档案汇总 */}
          <button
            className="flex flex-col items-center gap-1 bg-white rounded-xl py-3 border border-gray-100 shadow-sm active:bg-sky-50"
            onClick={() => {}}
          >
            <FileText size={18} className="text-sky-500" />
            <span className="text-xs font-medium text-gray-700">文字档案</span>
            <span className="text-xs text-gray-400">
              {records.filter((r) => r.record_type !== "voice").length} 条
            </span>
          </button>
          {/* 图像档案汇总 */}
          <button
            className="flex flex-col items-center gap-1 bg-white rounded-xl py-3 border border-gray-100 shadow-sm active:bg-sky-50"
            onClick={() => navigate(`/yaban/patient/${patientId}/media`)}
          >
            <ImageIcon size={18} className="text-sky-500" />
            <span className="text-xs font-medium text-gray-700">图像档案</span>
            <span className="text-xs text-gray-400">影像记录</span>
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 px-4 py-4 pb-32">

        {/* 录音控制区（录音中/分析中才显示） */}
        {(recordingState !== "idle") && (
          <div className="mb-4">{renderVoiceControls()}</div>
        )}

        {/* 待处理录音卡片 */}
        {pendingBlob && recordingState === "idle" && (
          <div className="bg-white border border-sky-100 rounded-2xl p-4 space-y-3 mb-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse flex-shrink-0" />
              <span className="text-sm font-medium text-sky-700">待处理语音笔记</span>
              <span className="ml-auto text-xs text-gray-400">
                {formatDuration(pendingDuration)} · {formatFileSize(pendingBlob.size)}
              </span>
            </div>
            {pendingBlobUrl && (
              <audio controls src={pendingBlobUrl} className="w-full" style={{ height: "36px" }} />
            )}
            <div className="flex gap-2">
              <button onClick={clearPending} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm">丢弃</button>
              <button onClick={reanalyzeBlob} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium">
                <RefreshCw size={13} />重新分析
              </button>
            </div>
          </div>
        )}

        {/* 时间线 */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="text-sky-500 animate-spin" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-3">
            <Search size={40} className="text-gray-200" />
            <p className="text-sm">{searchQuery ? `未找到含「${searchQuery}」的记录` : "暂无沟通记录"}</p>
            {!searchQuery && <p className="text-xs text-gray-300">点击下方按钮开始记录</p>}
          </div>
        ) : (
          <div>
            {groupedRecords.map((group) => (
              <div key={group.date}>
                {/* 日期分组标题 */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400 px-2">{group.date}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                {/* 该日期下的记录 */}
                {group.items.map((record) => (
                  <TimelineCard key={record.id} record={record} onDelete={handleDelete} patientId={patientId} />
                ))}
              </div>
            ))}
            {/* 时间线底部 */}
            <div className="flex gap-3 mt-1">
              <div className="flex flex-col items-center flex-shrink-0 pt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0" />
              </div>
              <p className="text-xs text-gray-300 pb-2">
                {searchQuery ? `找到 ${filteredRecords.length} 条` : `共 ${records.length} 条记录`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {recordingState === "idle" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-20">
          <div className="flex gap-2">
            {/* AI 语音秘书 */}
            <button
              onClick={startRecording}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-sky-500 text-white"
            >
              <Mic size={20} />
              <span className="text-xs font-medium">语音录入</span>
            </button>
            {/* 手动录入 */}
            <button
              onClick={() => setInputMode("manual")}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-gray-100 text-gray-600"
            >
              <Pencil size={20} />
              <span className="text-xs font-medium">手动录入</span>
            </button>
            {/* 微信聊天 */}
            <button
              onClick={() => setInputMode("wechat_view")}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-green-50 text-green-700"
            >
              <MessageSquare size={20} />
              <span className="text-xs font-medium">微信聊天</span>
            </button>
          </div>
        </div>
      )}

      {/* 弹窗：AI 分析结果确认 */}
      {analysisResult && (
        <AnalysisConfirmModal
          result={analysisResult}
          title={analysisTitle}
          onConfirm={handleConfirmAnalysis}
          onCancel={() => setAnalysisResult(null)}
        />
      )}

      {/* 弹窗：手动录入 */}
      {inputMode === "manual" && (
        <ManualInputModal
          onConfirm={handleConfirmManual}
          onCancel={() => setInputMode("none")}
        />
      )}

      {/* 弹窗：微信聊天记录查看 */}
      {inputMode === "wechat_view" && (
        <CustomerChatViewModal
          customerId={patientId}
          patientName={patientName}
          onClose={() => setInputMode("none")}
        />
      )}
    </div>
  );
}
