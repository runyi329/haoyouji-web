import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Download,
  Loader2,
} from "lucide-react";

interface Message {
  id: number;
  sender: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string | Date;
  is_read: number;
}

function formatTime(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "昨天 " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } else {
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) + " " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

function MessageBubble({ msg, isAdmin }: { msg: Message; isAdmin: boolean }) {
  const isSelf = isAdmin && msg.sender === "admin";
  const isFromAdmin = msg.sender === "admin";

  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"} mb-3`}>
      {!isSelf && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
          M
        </div>
      )}
      <div className={`max-w-[75%] ${isSelf ? "items-end" : "items-start"} flex flex-col`}>
        {!isSelf && !isAdmin && (
          <span className="text-xs text-gray-400 mb-1 ml-1">Manus</span>
        )}
        {/* 文字内容 */}
        {msg.content && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              isSelf
                ? "bg-[#D32F2F] text-white rounded-tr-sm"
                : "bg-white text-gray-800 shadow-sm rounded-tl-sm"
            }`}
          >
            {msg.content}
          </div>
        )}
        {/* 图片 */}
        {msg.file_url && msg.file_type === "image" && (
          <div className={`rounded-2xl overflow-hidden ${isSelf ? "rounded-tr-sm" : "rounded-tl-sm"} shadow-sm`}>
            <img
              src={msg.file_url}
              alt={msg.file_name || "图片"}
              className="max-w-full max-h-64 object-contain bg-gray-50"
              onClick={() => window.open(msg.file_url!, "_blank")}
            />
          </div>
        )}
        {/* 文件（非图片） */}
        {msg.file_url && msg.file_type !== "image" && (
          <a
            href={msg.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-3 py-2 rounded-2xl ${
              isSelf
                ? "bg-[#D32F2F] text-white rounded-tr-sm"
                : "bg-white text-gray-800 shadow-sm rounded-tl-sm"
            }`}
          >
            <FileText className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate max-w-[160px]">{msg.file_name}</div>
              <div className={`text-xs ${isSelf ? "text-red-200" : "text-gray-400"}`}>
                {msg.file_type?.toUpperCase()} · {formatFileSize(msg.file_size)}
              </div>
            </div>
            <Download className="w-4 h-4 flex-shrink-0 opacity-70" />
          </a>
        )}
        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {formatTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

export default function ManusChat() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    data: string;
    name: string;
    type: "image" | "pdf" | "ppt" | "excel" | "other";
    mime: string;
    size: number;
    previewUrl?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: messages, refetch } = trpc.manus.getMessages.useQuery({ limit: 100 }, {
    refetchInterval: 5000, // 每5秒轮询
  });

  const sendMutation = trpc.manus.sendMessage.useMutation({
    onSuccess: () => {
      setText("");
      setPendingFile(null);
      setSending(false);
      refetch();
    },
    onError: (err) => {
      toast.error("发送失败: " + err.message);
      setSending(false);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim() && !pendingFile) return;
    if (!isAdmin) return;
    setSending(true);
    sendMutation.mutate({
      content: text.trim() || undefined,
      fileData: pendingFile?.data,
      fileName: pendingFile?.name,
      fileType: pendingFile?.type,
      fileMime: pendingFile?.mime,
      fileSize: pendingFile?.size,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isImage: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("文件大小不能超过 20MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      let type: "image" | "pdf" | "ppt" | "excel" | "other" = "other";
      if (isImage) type = "image";
      else if (file.type.includes("pdf")) type = "pdf";
      else if (file.type.includes("presentation") || file.name.endsWith(".ppt") || file.name.endsWith(".pptx")) type = "ppt";
      else if (file.type.includes("spreadsheet") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx")) type = "excel";

      setPendingFile({
        data,
        name: file.name,
        type,
        mime: file.type,
        size: file.size,
        previewUrl: isImage ? data : undefined,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F5] max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] px-4 pt-10 pb-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/profile")}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
          M
        </div>
        <div className="flex-1">
          <div className="text-white font-semibold text-base">Manus</div>
          <div className="text-white/70 text-xs">AI 助理 · 实时在线</div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-lg">
              M
            </div>
            <p className="text-sm font-medium text-gray-500">Manus AI 助理</p>
            <p className="text-xs text-gray-400 mt-1">
              {isAdmin ? "在这里向用户发送消息、图片或文件" : "暂无消息，管理员将在这里与您沟通"}
            </p>
          </div>
        ) : (
          (messages as Message[]).map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isAdmin={isAdmin} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 待发送文件预览 */}
      {pendingFile && (
        <div className="px-4 py-2 bg-white border-t border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
            {pendingFile.previewUrl ? (
              <img src={pendingFile.previewUrl} alt="预览" className="w-12 h-12 object-cover rounded-lg" />
            ) : (
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#D32F2F]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700 truncate">{pendingFile.name}</div>
              <div className="text-xs text-gray-400">{formatFileSize(pendingFile.size)}</div>
            </div>
            <button
              onClick={() => setPendingFile(null)}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* 输入区域（仅管理员可见） */}
      {isAdmin ? (
        <div className="bg-white border-t border-gray-100 px-3 py-3 flex-shrink-0">
          <div className="flex items-end gap-2">
            {/* 附件按钮 */}
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              title="发送图片"
            >
              <ImageIcon className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              title="发送文件"
            >
              <Paperclip className="w-5 h-5 text-gray-500" />
            </button>
            {/* 文字输入 */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入消息..."
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D32F2F] bg-gray-50 max-h-24"
              style={{ minHeight: "38px" }}
            />
            {/* 发送按钮 */}
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && !pendingFile)}
              className="w-9 h-9 rounded-full bg-[#D32F2F] flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
          {/* 隐藏的文件输入 */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e, true)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.zip,.txt"
            className="hidden"
            onChange={(e) => handleFileSelect(e, false)}
          />
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 px-4 py-3 flex-shrink-0">
          <p className="text-center text-xs text-gray-400">管理员将在此与您沟通，请耐心等待</p>
        </div>
      )}
    </div>
  );
}
