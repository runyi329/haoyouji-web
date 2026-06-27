/**
 * 牙伴齿科 - 售前售后沟通记录页面
 * 功能：AI 语音秘书（录音转写）+ AI 文字秘书（企微，占位）+ 手动录入 + 时间线展示
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { toast } from "sonner";
import {
  ChevronLeft,
  Mic,
  MicOff,
  MessageSquare,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Loader2,
  X,
  Check,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";

// ---- 类型定义 ----
interface CommRecord {
  id: number;
  customer_id: number;
  record_type: "voice" | "text" | "manual";
  raw_text: string | null;
  audio_url: string | null;
  summary_demand: string | null;
  summary_key_points: string | null;
  summary_followup: string | null;
  summary_remark: string | null;
  ai_generated: number;
  operator_name: string | null;
  comm_at: string;
}

type RecordingState = "idle" | "recording" | "paused" | "analyzing";

// ---- 录音时长格式化 ----
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---- 文件大小格式化 ----
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---- 日期格式化 ----
function formatCommAt(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

// ---- 类型标签 ----
function RecordTypeTag({ type }: { type: string }) {
  if (type === "voice") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
        <Mic size={10} />
        AI 语音秘书
      </span>
    );
  }
  if (type === "text") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
        <MessageSquare size={10} />
        AI 文字秘书
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
      手动录入
    </span>
  );
}

// ---- AI 分析结果确认弹窗 ----
interface AnalysisResult {
  rawText: string;
  audioUrl: string | null;
  summaryDemand: string;
  summaryKeyPoints: string;
  summaryFollowup: string;
  summaryRemark: string;
}

function AnalysisConfirmModal({
  result,
  onConfirm,
  onCancel,
}: {
  result: AnalysisResult;
  onConfirm: (data: AnalysisResult) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState(result);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">AI 分析结果</span>
          <button onClick={onCancel} className="p-1 text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* 原始转写 */}
          <div>
            <button
              className="flex items-center gap-1 text-xs text-gray-500 mb-1"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              原始转写文字
            </button>
            {showRaw && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
                {data.rawText || "（无转写内容）"}
              </div>
            )}
          </div>

          {/* 摘要字段 */}
          {[
            { key: "summaryDemand" as const, label: "客户诉求" },
            { key: "summaryKeyPoints" as const, label: "沟通要点" },
            { key: "summaryFollowup" as const, label: "跟进事项" },
            { key: "summaryRemark" as const, label: "备注" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <textarea
                className="w-full text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2 border-0 outline-none resize-none min-h-[60px]"
                value={data[key]}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
                placeholder={`请输入${label}...`}
              />
            </div>
          ))}
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >
            重新录音
          </button>
          <button
            onClick={() => onConfirm(data)}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium"
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
    summaryKeyPoints: "",
    summaryFollowup: "",
    summaryRemark: "",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">手动录入沟通记录</span>
          <button onClick={onCancel} className="p-1 text-gray-400">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {[
            { key: "summaryDemand" as const, label: "客户诉求" },
            { key: "summaryKeyPoints" as const, label: "沟通要点" },
            { key: "summaryFollowup" as const, label: "跟进事项" },
            { key: "summaryRemark" as const, label: "备注" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <textarea
                className="w-full text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2 border-0 outline-none resize-none min-h-[60px]"
                value={data[key]}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
                placeholder={`请输入${label}...`}
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm({ ...data, rawText: data.summaryDemand })}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 单条记录卡片 ----
function CommRecordCard({
  record,
  onDelete,
}: {
  record: CommRecord;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent =
    record.summary_demand ||
    record.summary_key_points ||
    record.summary_followup ||
    record.summary_remark;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <RecordTypeTag type={record.record_type} />
          {record.ai_generated === 1 && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              AI 生成
            </span>
          )}
        </div>
        <button
          onClick={() => onDelete(record.id)}
          className="p-1 text-gray-300 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 摘要内容 */}
      {hasContent ? (
        <div className="px-4 pb-3 space-y-2">
          {record.summary_demand && (
            <div>
              <span className="text-xs text-gray-400">客户诉求</span>
              <p className="text-sm text-gray-900 mt-0.5">{record.summary_demand}</p>
            </div>
          )}
          {record.summary_key_points && (
            <div>
              <span className="text-xs text-gray-400">沟通要点</span>
              <p className="text-sm text-gray-900 mt-0.5">{record.summary_key_points}</p>
            </div>
          )}
          {record.summary_followup && (
            <div>
              <span className="text-xs text-gray-400">跟进事项</span>
              <p className="text-sm text-gray-900 mt-0.5">{record.summary_followup}</p>
            </div>
          )}
          {record.summary_remark && (
            <div>
              <span className="text-xs text-gray-400">备注</span>
              <p className="text-sm text-gray-900 mt-0.5">{record.summary_remark}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-3 text-sm text-gray-400">暂无摘要内容</div>
      )}

      {/* 原始转写（可展开） */}
      {record.raw_text && (
        <div className="border-t border-gray-50">
          <button
            className="flex items-center gap-1 w-full px-4 py-2 text-xs text-gray-400"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "收起原始转写" : "查看原始转写"}
          </button>
          {expanded && (
            <div className="px-4 pb-3 text-sm text-gray-500 leading-relaxed bg-gray-50">
              {record.raw_text}
            </div>
          )}
        </div>
      )}

      {/* 底部信息 */}
      <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-400">{formatCommAt(record.comm_at)}</span>
        {record.operator_name && (
          <span className="text-xs text-gray-400">{record.operator_name}</span>
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
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  // 待处理录音（分析失败时保留，供用户重新分析或播放）
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [pendingBlobUrl, setPendingBlobUrl] = useState<string | null>(null);

  // 录音相关 ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
  const analyzeVoiceMutation = trpc.yabanComm.analyzeVoice.useMutation({
    onError: (e) => { toast.error(`AI 分析失败：${e.message}`); setRecordingState("idle"); },
  });

  // 清理定时器和 blobUrl
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 清除待处理录音
  const clearPending = useCallback(() => {
    if (pendingBlobUrl) URL.revokeObjectURL(pendingBlobUrl);
    setPendingBlob(null);
    setPendingDuration(0);
    setPendingBlobUrl(null);
  }, [pendingBlobUrl]);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(1000); // 每秒收集一次数据
      setRecordingState("recording");

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (e) {
      toast.error("无法访问麦克风，请检查权限设置");
    }
  }, []);

  // 暂停录音
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingState("paused");
    }
  }, []);

  // 继续录音
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      setRecordingState("recording");
    }
  }, []);

  // 执行语音分析（传入 blob 和 mimeType）
  const doAnalyze = useCallback(async (blob: Blob, mimeType: string, savedDuration: number) => {
    // 失败时统一回退：保存 blob 供用户重新分析
    const fallbackToPending = () => {
      const url = URL.createObjectURL(blob);
      setPendingBlob(blob);
      setPendingDuration(savedDuration);
      setPendingBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setRecordingState("idle");
      setDuration(0);
      audioChunksRef.current = [];
    };
    // 使用 arrayBuffer + btoa 替代 FileReader.readAsDataURL
    // iOS Safari 对大 Blob 的 FileReader 有内存限制，会报 Load failed
    // arrayBuffer() + 分块 btoa 是 iOS 推荐的大文件读取方式
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      // 分块 btoa，避免 call stack 溢出（每块 8KB）
      let base64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        base64 += String.fromCharCode(...chunk);
      }
      base64 = btoa(base64);
      if (!base64) {
        toast.error("录音文件为空，请重新录音");
        fallbackToPending();
        return;
      }
      // 120 秒超时保护，避免请求挂起导致一直转圈圈（长录音转写需要更多时间）
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("分析超时（120秒），请重试")), 120000)
      );
      const result = await Promise.race([
        analyzeVoiceMutation.mutateAsync({
          customerId: patientId,
          audioBase64: base64,
          mimeType,
        }),
        timeoutPromise,
      ]);
      setAnalysisResult({
        rawText: result.rawText,
        audioUrl: result.audioUrl || null,
        summaryDemand: result.summaryDemand,
        summaryKeyPoints: result.summaryKeyPoints,
        summaryFollowup: result.summaryFollowup,
        summaryRemark: result.summaryRemark,
      });
      // 分析成功：清除待处理录音
      setPendingBlob(null);
      setPendingDuration(0);
      setPendingBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setRecordingState("idle");
      setDuration(0);
      audioChunksRef.current = [];
    } catch (err: any) {
      // 分析失败/超时：提示并保存 blob 供用户重新分析
      toast.error(`分析失败：${err?.message || "请重试"}`);
      fallbackToPending();
    }
  }, [patientId, analyzeVoiceMutation]);

  // 结束并分析
  const stopAndAnalyze = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    // 时长校验：太短会导致文件损坏，太长会超时
    if (duration < 2) {
      toast.error("录音太短，请至少录制 2 秒后再停止");
      cancelRecording();
      return;
    }
    if (duration > 900) {
      toast.warning("录音最长支持 15 分钟，已自动截断，正在分析...");
    }

    const recorder = mediaRecorderRef.current;
    const savedDuration = duration;
    setRecordingState("analyzing");

    recorder.onstop = async () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      // iOS WebKit bug: onstop 触发时最后一个数据块可能还没写入内存
      // 延迟 500ms 再读取，避免 FileReader 报 Load failed
      await new Promise((resolve) => setTimeout(resolve, 500));
      const mimeType = recorder.mimeType || "audio/mp4";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      await doAnalyze(blob, mimeType, savedDuration);
    };
    // 先请求最后一批数据（iOS 上确保最后的 chunk 被收集）
    try { recorder.requestData(); } catch (_) { /* 部分浏览器不支持 requestData */ }
    recorder.stop();
  }, [duration, doAnalyze]);

  // 重新分析待处理录音
  const reanalyzeBlob = useCallback(async () => {
    if (!pendingBlob) return;
    setRecordingState("analyzing");
    const mimeType = pendingBlob.type || "audio/mp4";
    await doAnalyze(pendingBlob, mimeType, pendingDuration);
  }, [pendingBlob, pendingDuration, doAnalyze]);

  // 取消录音
  const cancelRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    audioChunksRef.current = [];
    setRecordingState("idle");
    setDuration(0);
  }, []);

  // 保存 AI 分析结果
  const handleConfirmAnalysis = useCallback(
    (data: AnalysisResult) => {
      createMutation.mutate({
        customerId: patientId,
        recordType: "voice",
        rawText: data.rawText,
        audioUrl: data.audioUrl || undefined,
        summaryDemand: data.summaryDemand,
        summaryKeyPoints: data.summaryKeyPoints,
        summaryFollowup: data.summaryFollowup,
        summaryRemark: data.summaryRemark,
        aiGenerated: true,
        commAt: new Date().toISOString(),
      });
      setAnalysisResult(null);
    },
    [patientId, createMutation]
  );

  // 保存手动录入
  const handleConfirmManual = useCallback(
    (data: Omit<AnalysisResult, "audioUrl">) => {
      createMutation.mutate({
        customerId: patientId,
        recordType: "manual",
        summaryDemand: data.summaryDemand,
        summaryKeyPoints: data.summaryKeyPoints,
        summaryFollowup: data.summaryFollowup,
        summaryRemark: data.summaryRemark,
        aiGenerated: false,
        commAt: new Date().toISOString(),
      });
      setShowManualInput(false);
    },
    [patientId, createMutation]
  );

  // 删除记录
  const handleDelete = useCallback(
    (id: number) => {
      if (confirm("确认删除这条沟通记录？")) {
        deleteMutation.mutate({ id });
      }
    },
    [deleteMutation]
  );

  // ---- 录音控制区 ----
  const renderRecordingControls = () => {
    if (recordingState === "analyzing") {
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 size={32} className="text-blue-600 animate-spin" />
          <p className="text-sm text-gray-600">AI 正在分析录音内容...</p>
        </div>
      );
    }

    if (recordingState === "idle") {
      return (
        <div className="space-y-3">
          {/* 待处理录音预览卡片（分析失败时显示） */}
          {pendingBlob && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-700">录音待处理</span>
                <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                  {formatDuration(pendingDuration)} · {formatFileSize(pendingBlob.size)}
                </span>
              </div>
              {pendingBlobUrl && (
                <audio
                  controls
                  src={pendingBlobUrl}
                  className="w-full"
                  style={{ height: "36px" }}
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={clearPending}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm"
                >
                  丢弃
                </button>
                <button
                  onClick={reanalyzeBlob}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium"
                >
                  <RefreshCw size={14} />
                  重新分析
                </button>
              </div>
            </div>
          )}
          {/* 录音入口按钮 */}
          <div className="flex gap-3">
            {/* AI 语音秘书 */}
            <button
              onClick={startRecording}
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl bg-blue-600 text-white"
            >
              <Mic size={24} />
              <span className="text-sm font-medium">开启 AI 语音秘书</span>
            </button>
            {/* AI 文字秘书（占位） */}
            <button
              disabled
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl bg-gray-100 text-gray-400"
            >
              <MessageSquare size={24} />
              <span className="text-sm font-medium">AI 文字秘书</span>
              <span className="text-xs">即将上线</span>
            </button>
          </div>
        </div>
      );
    }

    // 录音中 / 暂停中
    return (
      <div className="bg-blue-50 rounded-2xl p-4 space-y-4">
        {/* 状态指示 */}
        <div className="flex items-center justify-center gap-3">
          {recordingState === "recording" ? (
            <span className="flex items-center gap-2 text-blue-600 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              录音中
            </span>
          ) : (
            <span className="flex items-center gap-2 text-gray-500 font-medium">
              <Pause size={14} />
              已暂停
            </span>
          )}
          <span className="text-2xl font-mono text-gray-900">{formatDuration(duration)}</span>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          {/* 取消 */}
          <button
            onClick={cancelRecording}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm"
          >
            <X size={14} />
            取消
          </button>
          {/* 暂停/继续 */}
          {recordingState === "recording" ? (
            <button
              onClick={pauseRecording}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-600 text-sm font-medium"
            >
              <Pause size={14} />
              暂停
            </button>
          ) : (
            <button
              onClick={resumeRecording}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-600 text-sm font-medium"
            >
              <Play size={14} />
              继续录音
            </button>
          )}
          {/* 结束并分析 */}
          <button
            onClick={stopAndAnalyze}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium"
          >
            <Check size={14} />
            结束并分析
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${patientId}`)} className="p-1">
            <ChevronLeft size={22} className="text-gray-700" />
          </button>
          <span className="text-base font-semibold text-gray-900">售前售后沟通记录</span>
          <button
            onClick={() => setShowManualInput(true)}
            className="p-1 text-blue-600"
          >
            <Plus size={22} />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 px-4 py-4 space-y-4 pb-32">
        {/* 录音控制区 */}
        {renderRecordingControls()}

        {/* 记录列表 */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
            <MessageSquare size={40} className="text-gray-200" />
            <p className="text-sm">暂无沟通记录</p>
            <p className="text-xs text-gray-300">点击"开启 AI 语音秘书"开始录音</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 px-1">共 {records.length} 条记录，按时间倒序</p>
            {records.map((record) => (
              <CommRecordCard
                key={record.id}
                record={record}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* AI 分析结果确认弹窗 */}
      {analysisResult && (
        <AnalysisConfirmModal
          result={analysisResult}
          onConfirm={handleConfirmAnalysis}
          onCancel={() => { setAnalysisResult(null); }}
        />
      )}

      {/* 手动录入弹窗 */}
      {showManualInput && (
        <ManualInputModal
          onConfirm={handleConfirmManual}
          onCancel={() => setShowManualInput(false)}
        />
      )}
    </div>
  );
}
