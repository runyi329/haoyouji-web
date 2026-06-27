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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  // 结束并分析
  const stopAndAnalyze = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    setRecordingState("analyzing");

    recorder.onstop = async () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });

      // 转 base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const result = await analyzeVoiceMutation.mutateAsync({
            customerId: patientId,
            audioBase64: base64,
            mimeType,
          });
          setAnalysisResult({
            rawText: result.rawText,
            audioUrl: result.audioUrl || null,
            summaryDemand: result.summaryDemand,
            summaryKeyPoints: result.summaryKeyPoints,
            summaryFollowup: result.summaryFollowup,
            summaryRemark: result.summaryRemark,
          });
          setRecordingState("idle");
          setDuration(0);
          audioChunksRef.current = [];
        } catch {
          setRecordingState("idle");
        }
      };
      reader.readAsDataURL(blob);
    };

    recorder.stop();
  }, [patientId, analyzeVoiceMutation]);

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
