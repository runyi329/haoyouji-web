import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, MoreHorizontal, Smile, Plus, Mic, Send } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: Date;
  sending?: boolean;
  error?: boolean;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}:${mins}`;

  // 今天：显示 上午/下午 + 时间
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    const h = date.getHours();
    const period = h < 12 ? "上午" : "下午";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${period} ${h12}:${mins}`;
  }
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `昨天 ${timeStr}`;
  }
  // 其他
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
}

// 是否需要显示时间戳（距上一条消息超过5分钟）
function shouldShowTime(current: Message, previous?: Message): boolean {
  if (!previous) return true;
  return current.time.getTime() - previous.time.getTime() > 5 * 60 * 1000;
}

// 打字机效果 hook
function useTypewriter(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) { setDone(true); return; }
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return { displayed, done };
}

// 单条 AI 消息（带打字机效果）
function AiMessageBubble({
  msg,
  isLatest,
  avatarUrl,
}: {
  msg: Message;
  isLatest: boolean;
  avatarUrl: string;
}) {
  const { displayed } = useTypewriter(isLatest && msg.sending === false ? msg.content : msg.content, isLatest ? 18 : 0);
  const text = isLatest ? displayed : msg.content;

  return (
    <div className="flex items-start gap-2 mb-1">
      {/* 头像 */}
      <img
        src={avatarUrl}
        alt="牙伴在线"
        className="w-10 h-10 rounded-md flex-shrink-0 object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%2307C160'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20' fill='white'%3E🦷%3C/text%3E%3C/svg%3E";
        }}
      />
      {/* 气泡 */}
      <div className="relative max-w-[72vw]">
        {/* 左侧小三角 */}
        <div
          className="absolute left-[-6px] top-[12px] w-0 h-0"
          style={{
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderRight: "6px solid #fff",
          }}
        />
        <div
          className="bg-white rounded-lg px-3 py-2 text-[15px] leading-[1.6] text-gray-900 shadow-sm"
          style={{ wordBreak: "break-word" }}
        >
          {msg.error ? (
            <span className="text-red-500">发送失败，请重试</span>
          ) : msg.sending ? (
            <span className="flex items-center gap-1 text-gray-400">
              <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          ) : (
            text
          )}
        </div>
      </div>
    </div>
  );
}

// 用户消息气泡
function UserMessageBubble({ msg, userAvatar }: { msg: Message; userAvatar: string }) {
  return (
    <div className="flex items-start gap-2 mb-1 flex-row-reverse">
      {/* 头像 */}
      <img
        src={userAvatar}
        alt="我"
        className="w-10 h-10 rounded-md flex-shrink-0 object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23576B95'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20' fill='white'%3E👤%3C/text%3E%3C/svg%3E";
        }}
      />
      {/* 气泡 */}
      <div className="relative max-w-[72vw]">
        {/* 右侧小三角 */}
        <div
          className="absolute right-[-6px] top-[12px] w-0 h-0"
          style={{
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderLeft: "6px solid #95EC69",
          }}
        />
        <div
          className="rounded-lg px-3 py-2 text-[15px] leading-[1.6] text-gray-900 shadow-sm"
          style={{ backgroundColor: "#95EC69", wordBreak: "break-word" }}
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

export default function YabanWechatChat() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionId = useRef(`web_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  // 牙伴在线头像（使用之前找到的 logo）
  const aiAvatar = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/points-mall/dental-care.webp";
  // 用户头像（默认）
  const userAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23576B95'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20' fill='white'%3E👤%3C/text%3E%3C/svg%3E";

  // 欢迎消息
  useEffect(() => {
    const welcome: Message = {
      id: "welcome",
      role: "assistant",
      content: "您好！我是牙伴在线客服，很高兴为您服务。请问有什么可以帮助您的？",
      time: new Date(),
      sending: false,
    };
    setMessages([welcome]);
  }, []);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 发送消息
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || loading) return;

    setInputText("");
    setShowExtra(false);

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      time: new Date(),
    };

    const aiPlaceholder: Message = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: "",
      time: new Date(),
      sending: true,
    };

    setMessages((prev) => [...prev, userMsg, aiPlaceholder]);
    setLoading(true);

    try {
      const resp = await fetch("/api/wecom/web-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          channel_id: 4,
          session_id: sessionId.current,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.reply) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiPlaceholder.id
              ? { ...m, content: data.reply, sending: false, time: new Date() }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiPlaceholder.id
              ? { ...m, content: data.error || "回复失败", sending: false, error: true }
              : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiPlaceholder.id
            ? { ...m, content: "网络错误，请重试", sending: false, error: true }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [inputText, loading]);

  // 回车发送（Shift+Enter 换行）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 自动调整输入框高度
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.target as HTMLTextAreaElement;
    setInputText(ta.value);
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden select-none"
      style={{ backgroundColor: "#ebebeb", fontFamily: "-apple-system, 'PingFang SC', sans-serif" }}
    >
      {/* ===== 顶部导航栏（微信风格）===== */}
      <div
        className="flex items-center px-2 py-2 flex-shrink-0 relative"
        style={{
          backgroundColor: "#ededed",
          borderBottom: "0.5px solid #d0d0d0",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* 返回按钮 */}
        <button
          className="flex items-center text-[#576B95] active:opacity-60 transition-opacity px-1 py-1 min-w-[44px]"
          onClick={() => navigate("/yaban")}
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>

        {/* 标题居中 */}
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <div className="text-[17px] font-medium text-gray-900 leading-tight">
            牙伴在线
          </div>
        </div>

        {/* 右侧更多 */}
        <button className="ml-auto text-gray-600 active:opacity-60 transition-opacity px-1 py-1 min-w-[44px] flex justify-end">
          <MoreHorizontal size={22} />
        </button>
      </div>

      {/* ===== 消息列表区域 ===== */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ backgroundColor: "#ebebeb" }}
        onClick={() => { setShowExtra(false); inputRef.current?.blur(); }}
      >
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const showTime = shouldShowTime(msg, prev);
          const isLatestAi = msg.role === "assistant" && idx === messages.length - 1;

          return (
            <div key={msg.id}>
              {/* 时间戳 */}
              {showTime && (
                <div className="text-center text-[12px] text-gray-400 my-3">
                  {formatTime(msg.time)}
                </div>
              )}
              {/* 消息气泡 */}
              <div className="mb-3">
                {msg.role === "assistant" ? (
                  <AiMessageBubble msg={msg} isLatest={isLatestAi} avatarUrl={aiAvatar} />
                ) : (
                  <UserMessageBubble msg={msg} userAvatar={userAvatar} />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== 底部输入栏 ===== */}
      <div
        className="flex-shrink-0"
        style={{
          backgroundColor: "#f5f5f5",
          borderTop: "0.5px solid #d0d0d0",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* 主输入行 */}
        <div className="flex items-end gap-2 px-2 py-2">
          {/* 语音/键盘切换 */}
          <button
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-600 active:opacity-60"
            onClick={() => setIsVoiceMode((v) => !v)}
          >
            {isVoiceMode ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="13" y2="16" />
              </svg>
            ) : (
              <Mic size={22} />
            )}
          </button>

          {/* 输入框 / 按住说话 */}
          {isVoiceMode ? (
            <button
              className="flex-1 h-9 rounded-md text-[15px] text-gray-700 active:bg-gray-300 transition-colors"
              style={{ backgroundColor: "#fff", border: "0.5px solid #d0d0d0" }}
            >
              按住 说话
            </button>
          ) : (
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder=""
              rows={1}
              className="flex-1 rounded-md px-3 py-2 text-[15px] text-gray-900 resize-none outline-none leading-[1.5] overflow-hidden"
              style={{
                backgroundColor: "#fff",
                border: "0.5px solid #d0d0d0",
                minHeight: "36px",
                maxHeight: "100px",
              }}
            />
          )}

          {/* 表情 */}
          <button className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-600 active:opacity-60">
            <Smile size={22} />
          </button>

          {/* 发送 or + */}
          {inputText.trim() ? (
            <button
              className="flex-shrink-0 h-9 px-3 rounded-md text-[15px] font-medium text-white active:opacity-80 transition-opacity"
              style={{ backgroundColor: "#07C160", minWidth: "52px" }}
              onClick={sendMessage}
              disabled={loading}
            >
              发送
            </button>
          ) : (
            <button
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-600 active:opacity-60"
              onClick={() => setShowExtra((v) => !v)}
            >
              <Plus size={22} />
            </button>
          )}
        </div>

        {/* 扩展面板（点击 + 展开） */}
        {showExtra && (
          <div className="px-4 py-4 grid grid-cols-4 gap-4" style={{ backgroundColor: "#f5f5f5" }}>
            {[
              { icon: "📷", label: "拍摄" },
              { icon: "🖼️", label: "图片" },
              { icon: "📁", label: "文件" },
              { icon: "📍", label: "位置" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl active:opacity-60"
                  style={{ backgroundColor: "#fff" }}
                >
                  {item.icon}
                </div>
                <span className="text-[11px] text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
