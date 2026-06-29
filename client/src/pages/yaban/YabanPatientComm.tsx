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
  Filter,
  Download,
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
  biz_type?: string | null;
  followup_date?: string | null;
  followup_status?: string | null;
  followup_assignee?: string | null;
}

type RecordingState = "idle" | "countdown" | "recording" | "paused" | "analyzing";
type InputMode = "none" | "voice" | "manual" | "wechat_view";

interface Appointment {
  id: number;
  patientId: number;
  doctor: string;
  room: string;
  project: string;
  appointDate: string; // YYYY-MM-DD
  appointTime: string;
  endTime: string;
  duration: number;
  status: string;
  remark: string;
}

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

// ---- 预约卡片组件 ----
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  booked:    { label: "已预约", color: "bg-sky-100 text-sky-600" },
  confirmed: { label: "已确认", color: "bg-green-100 text-green-600" },
  arrived:   { label: "已到诊", color: "bg-emerald-100 text-emerald-600" },
  done:      { label: "已完成", color: "bg-gray-100 text-gray-500" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-400" },
  missed:    { label: "未到诊", color: "bg-orange-100 text-orange-400" },
};

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const [open, setOpen] = useState(false);
  const status = STATUS_MAP[appointment.status] || { label: appointment.status, color: "bg-gray-100 text-gray-500" };
  const d = new Date(appointment.appointDate + "T00:00:00");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekDay = ["日","一","二","三","四","五","六"][d.getDay()];

  return (
    <div className="flex gap-3 mb-3">
      {/* 左侧日期列 */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 28 }}>
        <button
          className="flex flex-col items-center justify-center rounded-lg py-1"
          style={{ minWidth: 28, height: 56 }}
          onClick={() => setOpen(!open)}
        >
          <span className="text-[10px] text-gray-400 leading-none">{mo}月</span>
          <span className="text-base font-bold leading-none text-purple-500">{day}</span>
          <span className="text-[10px] text-gray-400 leading-none">{d.getFullYear()}</span>
          <span className="text-[10px] text-gray-400 leading-none">周{weekDay}</span>
        </button>
      </div>
      {/* 右侧卡片 */}
      <div className="flex-1 min-w-0 bg-purple-50 rounded-2xl border border-purple-100 shadow-sm overflow-hidden mb-0">
        <button
          className="w-full flex items-center justify-between px-3 pt-2.5 pb-2 text-left"
          onClick={() => setOpen(!open)}
        >
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            {!open && (
              <span className="text-sm font-medium text-purple-700 truncate leading-snug">
                {appointment.project || "预约就诊"}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 ${status.color}`}>
                {status.label}
              </span>
              {appointment.appointTime && (
                <span className="text-[10px] text-gray-400">{appointment.appointTime}{appointment.endTime ? ` ~ ${appointment.endTime}` : ""}</span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
            {open ? <ChevronUp size={14} className="text-purple-300" /> : <ChevronDown size={14} className="text-purple-300" />}
          </div>
        </button>
        {open && (
          <div className="border-t border-purple-100 px-3 pt-2 pb-3 space-y-1.5">
            {appointment.project && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">项目</span>
                <span className="text-xs text-gray-700">{appointment.project}</span>
              </div>
            )}
            {appointment.doctor && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">医生</span>
                <span className="text-xs text-gray-700">{appointment.doctor}</span>
              </div>
            )}
            {appointment.room && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">诊室</span>
                <span className="text-xs text-gray-700">{appointment.room}</span>
              </div>
            )}
            {appointment.remark && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">备注</span>
                <span className="text-xs text-gray-500">{appointment.remark}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">时间</span>
              <span className="text-[10px] text-gray-300">{appointment.appointDate} {appointment.appointTime}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- DayCard: 同一天合并卡片 ----
function DayCard({
  group,
  onDelete,
  patientId,
  showConnector = false,
  patientBirthday = "",
  onOpenArchive,
}: {
  group: { date: string; items: CommRecord[]; appointment?: Appointment };
  onDelete: (id: number) => void;
  patientId: number;
  showConnector?: boolean;
  patientBirthday?: string;
  onOpenArchive?: (tab: "voice" | "text" | "wechat", recordId?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showDateTip, setShowDateTip] = useState(false);
  const [, navigate] = useLocation();

  // 日期信息
  const dateStr = group.items[0]?.comm_at
    ? String(group.items[0].comm_at)
    : (group.appointment?.appointDate ? group.appointment.appointDate + "T00:00:00" : "");
  const d = dateStr ? new Date(dateStr) : new Date();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  const holidays: Record<string, string> = {
    "1-1":"元旦","2-4":"春节","2-5":"春节","2-6":"春节","2-7":"春节","2-8":"春节","2-9":"春节","2-10":"春节",
    "4-4":"清明","4-5":"清明","4-6":"清明",
    "5-1":"劳动节","5-2":"劳动节","5-3":"劳动节",
    "5-31":"端午","6-1":"端午","6-2":"端午",
    "10-1":"国庆","10-2":"国庆","10-3":"国庆","10-4":"国庆","10-5":"国庆","10-6":"国庆","10-7":"国庆",
  };
  const hKey = `${d.getMonth()+1}-${d.getDate()}`;
  const isHoliday = !!holidays[hKey];
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const isBirthday = (() => {
    if (!patientBirthday) return false;
    try { const bd = new Date(patientBirthday); return bd.getMonth() === d.getMonth() && bd.getDate() === d.getDate(); }
    catch { return false; }
  })();
  const dateColor = isBirthday ? "text-pink-500" : isHoliday ? "text-red-500" : isWeekend ? "text-orange-400" : "text-sky-500";
  const weekDays = ["周日","周一","周二","周三","周四","周五","周六"];
  const dateLabel = isBirthday ? "生日" : (holidays[hKey] || weekDays[d.getDay()]);

  // 折叠时摘要：预约项目或第一条记录第一行
  const appointment = group.appointment;
  const status = appointment ? (STATUS_MAP[appointment.status] || { label: appointment.status, color: "bg-gray-100 text-gray-500" }) : null;
  const firstRecord = group.items[0];
  const firstSummary = (() => {
    if (!firstRecord) return appointment?.project || "预约就诊";
    if (firstRecord.summary_key_points) {
      const line = firstRecord.summary_key_points.split("\n").filter(Boolean)[0];
      if (line) return line;
    }
    return firstRecord.summary_demand || firstRecord.summary_key_points || "暂无摘要";
  })();
  const totalItems = group.items.length;
  const voiceCount = group.items.filter(r => r.record_type === 'voice').length;

  return (
    <div className="flex gap-2 items-stretch mb-3">
      {/* 左侧日期列 */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: '28px', alignSelf: 'flex-start' }}>
        <div className="relative flex flex-col items-center leading-none w-full">
          <button
            className="flex flex-col items-center justify-between w-full py-1"
            style={{ minWidth: 0, minHeight: '56px' }}
            onClick={(e) => { e.stopPropagation(); setShowDateTip(!showDateTip); }}
          >
            <span className="text-[9px] text-gray-400 font-normal tracking-tight">{mo}月</span>
            {isBirthday ? (
              <span className="text-xs font-bold leading-tight" style={{
                background: 'linear-gradient(90deg,#f472b6,#fb923c,#facc15,#4ade80,#60a5fa,#c084fc)',
                backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                animation: 'birthdayShine 1.5s linear infinite',
              }}>{dayNum}</span>
            ) : (
              <span className={`text-xs font-bold leading-tight ${dateColor}`}>{dayNum}</span>
            )}
            <span className="text-[9px] text-gray-400 font-normal tracking-tight leading-tight">{year}</span>
            <span className="text-[9px] font-normal tracking-tight leading-tight text-gray-400">{dateLabel}</span>
          </button>
          {showDateTip && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDateTip(false)} />
              <div className="absolute left-9 top-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 w-40" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-gray-500 mb-2 font-medium">日期颜色说明</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0" /><span className="text-xs text-gray-600">工作日</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" /><span className="text-xs text-gray-600">双休日</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" /><span className="text-xs text-gray-600">法定节假日</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f472b6,#fb923c,#facc15,#4ade80,#60a5fa,#c084fc)' }} /><span className="text-xs text-gray-600">患者生日</span></div>
                </div>
              </div>
            </>
          )}
        </div>
        {showConnector && (
          <div className="w-px bg-gray-200" style={{ height: '12px', marginTop: '2px' }} />
        )}
      </div>

      {/* 右侧卡片：一天内全部内容，整张展开/收起 */}
      <div className="flex-1 min-w-0 bg-white rounded shadow-sm border border-gray-100 overflow-hidden">

        {/* 头部：点击整行展开/收起 */}
        <button
          className="w-full flex items-center justify-between px-3 pt-2.5 pb-2 text-left"
          onClick={() => setOpen(!open)}
        >
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            {/* 预约标签（有预约才显示） */}
            {appointment && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-purple-600">{appointment.project || "预约就诊"}</span>
                {status && <span className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 ${status.color}`}>{status.label}</span>}
                {appointment.appointTime && <span className="text-[10px] text-gray-400">{appointment.appointTime}</span>}
              </div>
            )}
            {/* 折叠时显示第一条摘要 */}
            {!open && (
              <span className="text-sm text-gray-800 truncate leading-snug">{firstSummary}</span>
            )}
            {/* 副行：记录数量标签 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {totalItems > 0 && (
                <span className="text-[10px] text-gray-400">
                  {totalItems}条记录{voiceCount > 0 ? `（包含${voiceCount}段语音）` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>

        {/* 展开内容：所有记录平铺 */}
        {open && (
          <div className="border-t border-gray-50">
            {/* 预约详情（有预约才显示） */}
            {appointment && (
              <div className="bg-purple-50 px-3 py-2 border-b border-purple-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-purple-700">{appointment.project || "预约就诊"}</span>
                  {status && <span className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 ${status.color}`}>{status.label}</span>}
                  {appointment.appointTime && <span className="text-[10px] text-gray-400">{appointment.appointTime}{appointment.endTime ? ` ~ ${appointment.endTime}` : ""}</span>}
                  {appointment.doctor && <span className="text-[10px] text-gray-400">医生: {appointment.doctor}</span>}
                </div>
                {appointment.remark && <p className="text-xs text-gray-400 mt-0.5">{appointment.remark}</p>}
              </div>
            )}
            {/* 每条记录内容 */}
            {group.items.map((record, idx) => {
              const ch = CHANNEL_CONFIG[record.record_type] || CHANNEL_CONFIG.manual;
              const summaryItems: string[] = (() => {
                if (record.summary_key_points) {
                  const lines = record.summary_key_points.split("\n").filter(Boolean);
                  if (lines.length > 0) return lines;
                }
                return [record.summary_demand, record.summary_hospital, record.summary_key_points, record.summary_followup, record.summary_remark].filter(Boolean) as string[];
              })();
              return (
                <div key={record.id} className={idx > 0 ? "border-t border-gray-100" : ""}>
                  {/* 条目标签行 */}
                  <div className="flex items-center gap-2 px-3 pt-2">
                    {record.biz_type === 'followup' ? (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 text-orange-600 bg-orange-50">随访{record.followup_status ? `·${record.followup_status}` : ''}</span>
                    ) : (
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 ${ch.tagClass}`}>{ch.label}</span>
                    )}
                    <span className="text-[10px] text-gray-300 ml-auto">
                      {new Date(record.comm_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* 语音播放器 */}
                  {record.record_type === 'voice' && record.audio_url && (
                    <div className="px-3 pt-1.5">
                      <audio controls src={record.audio_url} className="w-full" style={{ height: '36px' }} />
                    </div>
                  )}
                  {/* 摘要条目 */}
                  <div className="px-3 pt-1.5 pb-2">
                    {summaryItems.length > 0 ? (
                      <div className="space-y-1">
                        {summaryItems.map((item, i) => <SummaryItemRow key={i} index={i} text={item} />)}
                      </div>
                    ) : (
                      record.raw_text ? (
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{record.raw_text}</p>
                      ) : (
                        <p className="text-xs text-gray-300">暂无摘要</p>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {/* 底部操作行：档案入口 + 删除 */}
            {group.items.length > 0 && (
              <div className="px-3 pt-1.5 pb-2.5 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {group.items.some(r => r.record_type === 'voice') && (
                    <button onClick={(e) => { e.stopPropagation(); onOpenArchive?.('voice', group.items.find(r => r.record_type === 'voice')?.id); }} className="flex items-center gap-1 text-sky-500">
                      <Mic size={13} /><span className="text-xs">语音档案</span>
                    </button>
                  )}
                  {group.items.some(r => r.record_type === 'manual' || r.record_type === 'text') && (
                    <button onClick={(e) => { e.stopPropagation(); onOpenArchive?.('text', group.items.find(r => r.record_type === 'manual' || r.record_type === 'text')?.id); }} className="flex items-center gap-1 text-sky-500">
                      <FileText size={13} /><span className="text-xs">文字档案</span>
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/yaban/patient/${patientId}/media`); }} className="flex items-center gap-1 text-sky-500">
                    <ImageIcon size={13} /><span className="text-xs">图像档案</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {group.items.length === 1 && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(group.items[0].id); }} className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400">
                      <Trash2 size={12} />删除
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineCard({
  record,
  onDelete,
  patientId,
  showConnector = false,
  patientBirthday = "",
  hasVoice = false,
  hasText = false,
  onOpenArchive,
}: {
  record: CommRecord;
  onDelete: (id: number) => void;
  patientId: number;
  showConnector?: boolean;
  patientBirthday?: string;
  hasVoice?: boolean;
  hasText?: boolean;
  onOpenArchive?: (tab: "voice" | "text" | "wechat", recordId?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showDateTip, setShowDateTip] = useState(false);
  const [, navigate] = useLocation();
  const ch = CHANNEL_CONFIG[record.record_type] || CHANNEL_CONFIG.manual;

  // 日期类型判断
  const getDateType = (dateStr: string): "holiday" | "weekend" | "workday" => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    // 中国法定节假日（月-日格式）
    const holidays = [
      "1-1","2-4","2-5","2-6","2-7","2-8","2-9","2-10",// 元旦、春节
      "4-4","4-5","4-6",// 清明
      "5-1","5-2","5-3",// 劳动节
      "5-31","6-1","6-2",// 端午
      "10-1","10-2","10-3","10-4","10-5","10-6","10-7",// 国庆
    ];
    const key = `${m}-${day}`;
    if (holidays.includes(key)) return "holiday";
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return "weekend";
    return "workday";
  };
  const dateType = getDateType(record.comm_at);

  // 判断是否是患者生日（只比较月/日）
  const isBirthday = (() => {
    if (!patientBirthday) return false;
    try {
      const bd = new Date(patientBirthday);
      const rd = new Date(record.comm_at);
      return bd.getMonth() === rd.getMonth() && bd.getDate() === rd.getDate();
    } catch { return false; }
  })();

  const dateColor = isBirthday ? "text-pink-500" : dateType === "holiday" ? "text-red-500" : dateType === "weekend" ? "text-orange-400" : "text-sky-500";

  // 返回星期几或节日名称
  const getDateLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const holidayNames: Record<string, string> = {
      "1-1": "元旦",
      "2-4": "春节","2-5": "春节","2-6": "春节","2-7": "春节","2-8": "春节","2-9": "春节","2-10": "春节",
      "4-4": "清明节","4-5": "清明节","4-6": "清明节",
      "5-1": "劳动节","5-2": "劳动节","5-3": "劳动节",
      "5-31": "端午节","6-1": "端午节","6-2": "端午节",
      "10-1": "国庆","10-2": "国庆","10-3": "国庆","10-4": "国庆","10-5": "国庆","10-6": "国庆","10-7": "国庆",
    };
    const key = `${m}-${day}`;
    if (holidayNames[key]) return holidayNames[key];
    const weekDays = ["周日","周一","周二","周三","周四","周五","周六"];
    return weekDays[d.getDay()];
  };
  const dateLabelRaw = getDateLabel(record.comm_at);
  const dateLabel = isBirthday ? "生日" : dateLabelRaw;

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

  // 内部判断（已由外部 props 传入 hasVoice/hasText，旧变量删除）

  return (
    <div className="flex gap-2 items-stretch">
      {/* 左侧时间列 */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: '28px', alignSelf: 'flex-start' }}>
        {/* 竖排叠字日期 */}
        <div className="relative flex flex-col items-center leading-none w-full">
          <button
            className="flex flex-col items-center justify-between w-full py-1"
            style={{ minWidth: 0, minHeight: '56px' }}
            onClick={(e) => { e.stopPropagation(); setShowDateTip(!showDateTip); }}
          >
            <span className="text-[9px] text-gray-400 font-normal tracking-tight">
              {String(new Date(record.comm_at).getMonth()+1).padStart(2,'0')}月
            </span>
            {isBirthday ? (
              <span className="text-xs font-bold leading-tight animate-pulse" style={{
                background: 'linear-gradient(90deg, #f472b6, #fb923c, #facc15, #4ade80, #60a5fa, #c084fc)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'birthdayShine 1.5s linear infinite',
              }}>
                {String(new Date(record.comm_at).getDate()).padStart(2,'0')}
              </span>
            ) : (
              <span className={`text-xs font-bold leading-tight ${dateColor}`}>
                {String(new Date(record.comm_at).getDate()).padStart(2,'0')}
              </span>
            )}
            <span className="text-[9px] text-gray-400 font-normal tracking-tight leading-tight">
              {new Date(record.comm_at).getFullYear()}
            </span>
            <span className="text-[9px] font-normal tracking-tight leading-tight text-gray-400">
              {dateLabel}
            </span>
          </button>
          {/* 图例 tooltip */}
          {showDateTip && (
            <>
              {/* 透明遮罩层，点击关闭 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowDateTip(false)}
              />
              <div
                className="absolute left-9 top-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 w-40"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs text-gray-500 mb-2 font-medium">日期颜色说明</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600">工作日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                    <span className="text-xs text-gray-600">双休日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600">法定节假日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f472b6,#fb923c,#facc15,#4ade80,#60a5fa,#c084fc)' }} />
                    <span className="text-xs text-gray-600">患者生日</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        {/* 不同日期间短连接线 */}
        {showConnector && (
          <div className="w-px bg-gray-200" style={{ height: '12px', marginTop: '2px' }} />
        )}
      </div>

      {/* 右侧卡片 */}
      <div className="flex-1 bg-white rounded shadow-sm border border-gray-100 overflow-hidden mb-3" style={{ minHeight: '56px' }}>

        {/* 头部：点击整行展开/收起 */}
        <button
          className="w-full flex items-center justify-between px-3 pt-2.5 pb-2 text-left"
          onClick={() => setOpen(!open)}
        >
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            {/* 主内容：摘要第一条（展开时隐藏） */}
            {!open && (
              <span className="text-sm text-gray-800 truncate leading-snug">
                {firstSummary || "暂无摘要"}
              </span>
            )}
            {/* 副行：小标签 + 时间 */}
            <div className="flex items-center gap-1.5">
              {record.biz_type === 'followup' ? (
                <span className="inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 text-orange-600 bg-orange-50">随访{record.followup_status ? `·${record.followup_status}` : ''}</span>
              ) : (
                <span className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded flex-shrink-0 ${ch.tagClass}`}>
                  {ch.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
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
            <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 flex items-center justify-between">
              {/* 左侧：三个档案入口（有内容才显示） */}
              <div className="flex items-center gap-4">
                {/* 语音档案：有语音记录才显示 */}
                {hasVoice && record.record_type === 'voice' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenArchive?.('voice', record.id); }}
                    className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                  >
                    <Mic size={14} />
                    <span className="text-xs">语音档案</span>
                  </button>
                )}
                {/* 文字档案：当前记录是手动/微信才显示 */}
                {hasText && (record.record_type === 'manual' || record.record_type === 'text') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenArchive?.('text', record.id); }}
                    className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                  >
                    <FileText size={14} />
                    <span className="text-xs">文字档案</span>
                  </button>
                )}
                {/* 图像档案：始终显示 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/yaban/patient/${patientId}/media?recordId=${record.id}`);
                  }}
                  className="flex items-center gap-1 text-sky-500 hover:text-sky-600"
                >
                  <ImageIcon size={14} />
                  <span className="text-xs">图像档案</span>
                </button>
              </div>
              {/* 右侧：删除 + 时间戳 */}
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                  className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400"
                >
                  <Trash2 size={12} />删除
                </button>
                <span className="text-[10px] text-gray-300">
                  {new Date(record.comm_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
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

  // 时间筛选
  const [timeFilter, setTimeFilter] = useState<"all"|"today"|"week"|"month"|"quarter"|"year"|"custom">("all");
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const TIME_FILTER_LABELS = { all: "全部", today: "今日", week: "本周", month: "本月", quarter: "本季度", year: "本年", custom: "自定义" };

  const getTimeRange = (filter: string): { start: Date | null; end: Date | null } => {
    const now = new Date();
    const sod = (d: Date) => { const r = new Date(d); r.setHours(0,0,0,0); return r; };
    if (filter === "today") return { start: sod(now), end: now };
    if (filter === "week") { const s = new Date(now); s.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { start: sod(s), end: now }; }
    if (filter === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    if (filter === "quarter") { const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end: now }; }
    if (filter === "year") return { start: new Date(now.getFullYear(), 0, 1), end: now };
    if (filter === "custom" && customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd + "T23:59:59") };
    return { start: null, end: null };
  };

  // 输入模式
  const [inputMode, setInputMode] = useState<InputMode>("none");

  // 档案全览抽屉
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab] = useState<"voice" | "text" | "wechat">("voice");
  const [archiveHighlightId, setArchiveHighlightId] = useState<number | null>(null);

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
  const patientBirthday = (patientQuery.data as any)?.birthday || "";

  // 数据查询
  const { data, refetch, isLoading } = trpc.yabanComm.list.useQuery(
    { customerId: patientId },
    { enabled: patientId > 0 }
  );
  const records: CommRecord[] = (data?.records as CommRecord[]) || [];
  const appointments: Appointment[] = (data?.appointments as Appointment[]) || [];

  // mutations
  const createMutation = trpc.yabanComm.create.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("沟通记录已保存");
      setAnalysisResult(null);
      setInputMode("none");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.yabanComm.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  // 档案全览打开后自动滚动到高亮记录
  useEffect(() => {
    if (showArchive && archiveHighlightId) {
      setTimeout(() => {
        const el = document.getElementById(`archive-record-${archiveHighlightId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [showArchive, archiveHighlightId]);

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

  // ---- 语音分析（FormData 上传，异步轮询） ----
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

      // 1. 上传录音，立即返回 jobId
      const resp = await fetch("/api/yaban/analyze-voice-upload", {
        method: "POST",
        body: formData,
        headers: { ...(currentTenantId ? { "x-yaban-tenant": String(currentTenantId) } : {}) },
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const { jobId } = await resp.json();

      // 2. 立即恢复界面，显示「AI 处理中」toast
      setPendingBlob(null);
      setPendingDuration(0);
      setPendingBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setRecordingState("idle");
      setDuration(0);
      setInputMode("none");
      audioChunksRef.current = [];
      const toastId = toast.loading("AI 正在处理录音，完成后自动更新...");

      // 3. 轮询 jobId，最多等 3 分钟
      const maxWait = 180000;
      const interval = 2000;
      const startTime = Date.now();
      const poll = async () => {
        if (Date.now() - startTime > maxWait) {
          toast.dismiss(toastId);
          toast.error("AI 处理超时，请稍后刷新页面查看结果");
          return;
        }
        try {
          const jobResp = await fetch(`/api/yaban/analyze-voice-job/${jobId}`, {
            headers: { ...(currentTenantId ? { "x-yaban-tenant": String(currentTenantId) } : {}) },
          });
          if (!jobResp.ok) { setTimeout(poll, interval); return; }
          const job = await jobResp.json();
          if (job.status === "pending") { setTimeout(poll, interval); return; }
          toast.dismiss(toastId);
          if (job.status === "error") {
            toast.error(`AI 处理失败：${job.error || "未知错误"}`);
            return;
          }
          // done：刷新列表，弹出确认弹窗
          refetch();
          const result = job.result;
          setAnalysisTitle("AI 语音分析结果");
          setAnalysisRecordType("voice");
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
          toast.success("AI 处理完成！");
        } catch (_) { setTimeout(poll, interval); }
      };
      setTimeout(poll, interval);
    } catch (err: any) {
      const msg = err?.message || "请重试";
      toast.error(`上传失败：${msg}`);
      fallbackToPending();
    }
  }, [patientId, currentTenantId, refetch]);

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
      // 关闭弹窗由 onSuccess 回调统一处理，确保数据已刷新后再关闭
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
      // 关闭弹窗由 onSuccess 回调统一处理
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
  const { start: timeStart, end: timeEnd } = getTimeRange(timeFilter);
  const filteredRecords = records.filter((r) => {
    // 时间过滤
    if (timeStart && timeEnd) {
      const t = new Date(r.comm_at);
      if (t < timeStart || t > timeEnd) return false;
    }
    // 关键词搜索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return [
        r.summary_demand,
        r.summary_key_points,
        r.summary_followup,
        r.summary_remark,
        r.raw_text,
        r.operator_name,
      ].filter(Boolean).some((field) => field!.toLowerCase().includes(q));
    }
    return true;
  });

  // ---- 按日期分组（合并预约信息） ----
  const groupedRecords = filteredRecords.reduce<{ date: string; items: CommRecord[]; appointment?: Appointment }[]>((acc, r) => {
    const date = formatCommDate(r.comm_at);
    const last = acc[acc.length - 1];
    if (last && last.date === date) {
      last.items.push(r);
    } else {
      // 找到当天的预约（匹配 YYYY-MM-DD 格式）
      const dateKey = r.comm_at ? String(r.comm_at).slice(0, 10) : "";
      const appt = appointments.find(a => a.appointDate === dateKey);
      acc.push({ date, items: [r], appointment: appt });
    }
    return acc;
  }, []);

  // 对于有预约但当天无沟通记录的日期，也要展示预约卡片
  const appointmentOnlyDates = appointments
    .filter(a => !filteredRecords.some(r => String(r.comm_at).slice(0, 10) === a.appointDate))
    .map(a => ({ date: a.appointDate, items: [] as CommRecord[], appointment: a }));

  // 合并并按日期倒序排列
  const allGroups = [...groupedRecords, ...appointmentOnlyDates]
    .sort((a, b) => b.date.localeCompare(a.date));

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
        {/* 标题行 */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${patientId}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">{patientName ? `${patientName} · 动态全览` : '动态全览'}</span>
          </div>
          <span className="w-8" />
        </div>
        {/* 快捷入口容器行 */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => setShowArchive(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-xl px-3 py-2 text-white text-xs font-medium transition-colors"
          >
            <FileText size={13} />
            档案全览
          </button>
        </div>
      </div>

      {/* 搜索框 + 筛选按鈕 */}
      <div className="bg-gray-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-gray-200 shadow-sm">
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
          {/* 时间筛选按鈕 */}
          <button
            onClick={() => setShowTimeFilter(!showTimeFilter)}
            className={`flex items-center gap-1 px-3 py-2.5 rounded-xl border shadow-sm text-xs font-medium flex-shrink-0 transition-colors ${
              timeFilter !== "all"
                ? "bg-sky-500 text-white border-sky-500"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            <Filter size={13} />
            {TIME_FILTER_LABELS[timeFilter]}
          </button>
        </div>
        {/* 时间筛选卡片面板 */}
        {showTimeFilter && (() => {
          // 计算每个时间段的条数
          const countFor = (key: string) => {
            if (key === "all") return records.length;
            const { start, end } = getTimeRange(key);
            if (!start || !end) return 0;
            return records.filter(r => { const t = new Date(r.comm_at); return t >= start && t <= end; }).length;
          };
          const visibleKeys = (["all", "today", "week", "month", "quarter", "year"] as const).filter(k => countFor(k) > 0);
          return (
            <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
              {/* 有数据的时间段卡片 */}
              {visibleKeys.length > 0 && (
                <div className="grid grid-cols-3 gap-2 p-3">
                  {visibleKeys.map((key) => (
                    <button
                      key={key}
                      onClick={() => { setTimeFilter(key); setShowTimeFilter(false); }}
                      className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        timeFilter === key
                          ? "bg-sky-500 text-white border-sky-500"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-sky-50 hover:border-sky-300"
                      }`}
                    >
                      <span className="text-sm font-medium">{TIME_FILTER_LABELS[key]}</span>
                      <span className={`text-xs leading-tight ${
                        timeFilter === key ? "text-white/80" : "text-sky-400"
                      }`}>{countFor(key)}条</span>
                    </button>
                  ))}
                </div>
              )}
              {/* 自定义时间段 */}
              <div className="border-t border-gray-100 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <p className="text-xs text-gray-400">自定义时间段</p>
                  {customStart && customEnd && (
                    <span className="text-xs text-sky-400">{countFor("custom")}条</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-sky-400" />
                  <span className="text-xs text-gray-400">至</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-sky-400" />
                  <button
                    onClick={() => { if (customStart && customEnd) { setTimeFilter("custom"); setShowTimeFilter(false); } }}
                    className="px-3 py-1.5 bg-sky-500 text-white text-xs rounded-lg disabled:opacity-40"
                    disabled={!customStart || !customEnd}
                  >确定</button>
                </div>
              </div>
            </div>
          );
        })()}
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
        ) : (filteredRecords.length === 0 && allGroups.length === 0) ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-3">
            <Search size={40} className="text-gray-200" />
            <p className="text-sm">{searchQuery ? `未找到含「${searchQuery}」的记录` : "暂无沟通记录"}</p>
            {!searchQuery && <p className="text-xs text-gray-300">点击下方按鈕开始记录</p>}
          </div>
        ) : (
          <div>
            {allGroups.map((group, groupIdx) => (
              <DayCard
                key={group.date}
                group={group}
                onDelete={handleDelete}
                patientId={patientId}
                showConnector={groupIdx < allGroups.length - 1}
                patientBirthday={patientBirthday}
                onOpenArchive={(tab, recordId) => { setArchiveTab(tab); setArchiveHighlightId(recordId ?? null); setShowArchive(true); }}
              />
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

      {/* 档案全览抽屉 */}
      {showArchive && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40" onClick={() => setShowArchive(false)}>
          <div className="bg-white rounded-t-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
            {/* 抽屉标题 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-base font-semibold text-gray-800">档案全览</span>
              <button onClick={() => setShowArchive(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            {/* Tab 切换 */}
            <div className="flex border-b border-gray-100">
              {([
                { key: "voice" as const, label: "语音档案", icon: <Mic size={13} /> },
                { key: "text" as const, label: "文字档案", icon: <Pencil size={13} /> },
                { key: "wechat" as const, label: "微信聊天", icon: <MessageSquare size={13} /> },
              ]).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setArchiveTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    archiveTab === key ? "border-sky-500 text-sky-600" : "border-transparent text-gray-400"
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
            {/* Tab 内容 */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
              {archiveTab === "voice" && (
                <div className="space-y-3">
                  <button
                    onClick={() => { setShowArchive(false); startRecording(); }}
                    className="w-full flex items-center gap-2 py-3 px-4 rounded-xl bg-sky-500 text-white text-sm font-medium"
                  >
                    <Mic size={16} />
                    <span>开始语音录入</span>
                  </button>
                  {records.filter(r => r.record_type === "voice").length === 0 ? (
                    <p className="text-center text-xs text-gray-300 py-8">暂无语音档案</p>
                  ) : (
                    <>
                      {archiveHighlightId && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-sky-500">当前记录</span>
                          <button
                            onClick={() => setArchiveHighlightId(null)}
                            className="text-xs text-gray-400 hover:text-sky-500"
                          >查看全部</button>
                        </div>
                      )}
                      {records
                        .filter(r => r.record_type === "voice" && (!archiveHighlightId || r.id === archiveHighlightId))
                        .map(r => {
                          const summaryLines = r.summary_key_points
                            ? r.summary_key_points.split("\n").filter(Boolean)
                            : [r.summary_demand, r.summary_key_points, r.summary_followup].filter(Boolean) as string[];
                          return (
                            <div
                              key={r.id}
                              id={`archive-record-${r.id}`}
                              className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden"
                            >
                              {/* 播放器 */}
                              {r.audio_url && (
                                <div className="px-3 pt-3">
                                  <audio controls src={r.audio_url} className="w-full h-8" style={{ outline: 'none' }} />
                                </div>
                              )}
                              {/* 摘要内容 */}
                              {summaryLines.length > 0 ? (
                                <div className="px-3 pt-2 pb-2 space-y-1">
                                  {summaryLines.map((line, idx) => (
                                    <div key={idx} className="flex items-start gap-1.5">
                                      <span className="mt-1 w-1 h-1 rounded-full bg-sky-400 flex-shrink-0" />
                                      <span className="text-xs text-gray-700 leading-relaxed">{line}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : r.raw_text ? (
                                <p className="px-3 pt-2 pb-2 text-xs text-gray-500 leading-relaxed line-clamp-3">{r.raw_text}</p>
                              ) : (
                                <p className="px-3 pt-2 pb-2 text-xs text-gray-300">暂无转写内容</p>
                              )}
                              {/* 底部：完整时间 + 下载 */}
                              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-50">
                                <span className="text-[10px] text-gray-300">
                                  {new Date(r.comm_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                {r.audio_url && (
                                  <a
                                    href={r.audio_url}
                                    download
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-sky-500"
                                  >
                                    <Download size={13} />
                                    <span>下载</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })
                      }
                    </>
                  )}
                </div>
              )}
              {archiveTab === "text" && (
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowArchive(false); setInputMode("manual"); }}
                    className="w-full flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium"
                  >
                    <Pencil size={16} />
                    <span>新增文字记录</span>
                  </button>
                  {records.filter(r => r.record_type === "manual").length === 0 ? (
                    <p className="text-center text-xs text-gray-300 py-8">暂无文字档案</p>
                  ) : (
                    <>
                      {archiveHighlightId && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-sky-500">当前记录</span>
                          <button onClick={() => setArchiveHighlightId(null)} className="text-xs text-gray-400 hover:text-sky-500">查看全部</button>
                        </div>
                      )}
                      {records
                        .filter(r => r.record_type === "manual" && (!archiveHighlightId || r.id === archiveHighlightId))
                        .map(r => (
                          <TimelineCard key={r.id} record={r} onDelete={handleDelete} patientId={patientId} />
                        ))
                      }
                    </>
                  )}
                </div>
              )}
              {archiveTab === "wechat" && (
                <div className="space-y-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowArchive(false); setTimeout(() => setInputMode("wechat_view"), 50); }}
                    className="w-full flex items-center gap-2 py-3 px-4 rounded-xl bg-green-50 text-green-700 text-sm font-medium"
                  >
                    <MessageSquare size={16} />
                    <span>查看微信聊天记录</span>
                  </button>
                  {records.filter(r => r.record_type === "text").length === 0 ? (
                    <p className="text-center text-xs text-gray-300 py-8">暂无微信聊天档案</p>
                  ) : (
                    <>
                      {archiveHighlightId && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-sky-500">当前记录</span>
                          <button onClick={() => setArchiveHighlightId(null)} className="text-xs text-gray-400 hover:text-sky-500">查看全部</button>
                        </div>
                      )}
                      {records
                        .filter(r => r.record_type === "text" && (!archiveHighlightId || r.id === archiveHighlightId))
                        .map(r => (
                          <TimelineCard key={r.id} record={r} onDelete={handleDelete} patientId={patientId} />
                        ))
                      }
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 底部操作栏 */}
      {recordingState === "idle" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-20">
          <div className="flex gap-2">
            <button
              onClick={startRecording}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-sky-500 text-white"
            >
              <Mic size={20} />
              <span className="text-xs font-medium">语音录入</span>
            </button>
            <button
              onClick={() => setInputMode("manual")}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-gray-100 text-gray-600"
            >
              <Pencil size={20} />
              <span className="text-xs font-medium">手动录入</span>
            </button>
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
