import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, MoreHorizontal, Wifi } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { avatarSrc, type AvatarKey } from "../../lib/yaban-avatar";
import { useYabanClinic } from "./useYabanClinic";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: Date;
  sending?: boolean;
  error?: boolean;
  isVoice?: boolean;   // 是否是语音消息
  voiceSecs?: number;  // 语音时长（秒）
}

function formatTime(date: Date): string {
  const now = new Date();
  const mins = date.getMinutes().toString().padStart(2, "0");
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
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const timeStr = `${date.getHours().toString().padStart(2, "0")}:${mins}`;
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `昨天 ${timeStr}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
}

function shouldShowTime(current: Message, previous?: Message): boolean {
  if (!previous) return true;
  return current.time.getTime() - previous.time.getTime() > 5 * 60 * 1000;
}

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

// 声波动画组件（仿微信绿色波形）
function SoundWave() {
  const bars = [3, 6, 10, 14, 10, 6, 3, 6, 10, 14, 18, 14, 10, 6, 3, 6, 10, 14, 10, 6, 3];
  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 40 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            backgroundColor: "#333",
            borderRadius: 2,
            animation: `waveBar 0.8s ease-in-out infinite`,
            animationDelay: `${(i % 7) * 0.08}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes waveBar {
          0%, 100% { transform: scaleY(1); opacity: 0.7; }
          50% { transform: scaleY(1.8); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// 默认用户头像（蓝灰色方形）
const DEFAULT_USER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='4' fill='%23576B95'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

// AI 头像
const AI_AVATAR = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/points-mall/dental-care.webp";

// 头像组件（偏方形外边框）
function Avatar({ src, alt, fallback, gradient }: { src: string; alt: string; fallback: string; gradient?: boolean }) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: "hidden",
        background: gradient
          ? "linear-gradient(135deg, #4facfe 0%, #00c6fb 50%, #1a78c2 100%)"
          : "#f0f0f0",
        border: gradient ? "none" : "1px solid #d0d0d0",
        padding: gradient ? 4 : 0,
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          borderRadius: gradient ? 4 : 0,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = fallback;
        }}
      />
    </div>
  );
}

function AiMessageBubble({
  msg,
  isLatest,
}: {
  msg: Message;
  isLatest: boolean;
}) {
  const { displayed } = useTypewriter(
    isLatest && msg.sending === false ? msg.content : msg.content,
    isLatest ? 18 : 0
  );
  const text = isLatest ? displayed : msg.content;

  return (
    <div className="flex items-start gap-2 mb-1">
      <Avatar src={AI_AVATAR} alt="牙伴在线" fallback={DEFAULT_USER_AVATAR} gradient />
      <div className="relative max-w-[72vw]">
        <div
          className="absolute left-[-6px] top-[12px] w-0 h-0"
          style={{
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderRight: "6px solid #fff",
          }}
        />
        <div
          className="bg-white px-3 py-2 text-[18px] leading-[1.6] text-gray-900 shadow-sm"
          style={{ wordBreak: "break-word", borderRadius: 4 }}
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

function UserMessageBubble({ msg, userAvatar }: { msg: Message; userAvatar: string }) {
  return (
    <div className="flex items-start gap-2 mb-1 flex-row-reverse">
      <Avatar src={userAvatar} alt="我" fallback={DEFAULT_USER_AVATAR} />
      <div className="relative max-w-[72vw]">
        <div
          className="absolute right-[-6px] top-[12px] w-0 h-0"
          style={{
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderLeft: `6px solid ${msg.isVoice ? "#95EC69" : "#95EC69"}`,
          }}
        />
        {msg.isVoice ? (
          /* 语音气泡：「X" 🔊」仿微信 */
          <div
            className="flex items-center gap-2 px-3 py-2 shadow-sm"
            style={{ backgroundColor: "#95EC69", borderRadius: 4, minWidth: 64 }}
          >
            <span className="text-[17px] font-medium text-gray-900">{msg.voiceSecs}"</span>
            {/* 仿微信语音图标：直接用 lucide 的 Wifi 图标顺时针旋转 90°（弧开口朝右、实心点在右） */}
            <Wifi
              size={18}
              strokeWidth={2}
              style={{ transform: "rotate(-90deg)", color: "#1a1a1a" }}
            />
          </div>
        ) : (
          <div
            className="px-3 py-2 text-[18px] leading-[1.6] text-gray-900 shadow-sm"
            style={{ backgroundColor: "#95EC69", wordBreak: "break-word", borderRadius: 4 }}
          >
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

// 录音状态：idle | recording | cancel | toText
type RecordState = "idle" | "recording" | "cancel" | "toText";

export default function YabanWechatChat() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordSecs, setRecordSecs] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessionId = useRef(`web_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = useRef(0);

  // 获取当前登录用户 ID（脉动网 UID），用于关联聊天记录
  const { data: meData } = trpc.auth.me.useQuery();

  // 动态获取当前诊所绑定的 channel_id
  const { currentTenantId } = useYabanClinic();
  const [dynamicChannelId, setDynamicChannelId] = useState<number>(4); // 默认 4，等待动态覆盖
  const [channelResolved, setChannelResolved] = useState(false); // channel_id 是否已从后端确认
  useEffect(() => {
    if (!currentTenantId) return;
    fetch(`/api/wecom/service-binding/channel?service_type=yaban&service_tenant_id=${currentTenantId}`)
      .then(r => r.json())
      .then(d => {
        if (d.binding?.channel_id) {
          setDynamicChannelId(Number(d.binding.channel_id));
        }
        setChannelResolved(true); // 无论是否有绑定，都标记为已确认
      })
      .catch(() => setChannelResolved(true)); // 查询失败也标记，用默认值继续
  }, [currentTenantId]);

  // 动态获取用户头像
  const { data: avatarData } = trpc.yabanCustomer.myAvatar.useQuery(undefined, {
    retry: false,
  });
  const userAvatar = avatarData?.avatar
    ? avatarData.type === "url"
      ? avatarData.avatar  // 脸动网头像，直接用 URL
      : avatarSrc(avatarData.avatar as AvatarKey)  // 年龄+性别匹配的卡通头像 key
    : DEFAULT_USER_AVATAR;

  // 欢迎消息：从后端按优先级链获取（诊所级 > 渠道级 > 平台级），开关关闭则不显示
  // 等 channelResolved=true（channel_id 已从后端确认）后再发请求，避免用默认值查不到诊所级配置
  const welcomeFetchedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || !channelResolved) return;
    if (welcomeFetchedRef.current) return;
    welcomeFetchedRef.current = true;
    const params = new URLSearchParams();
    params.set('channel_id', String(dynamicChannelId));
    params.set('tenant_id', String(currentTenantId));
    fetch(`/api/wecom/web-chat-welcome?${params.toString()}`)
      .then(r => r.json())
      .then((data: { enabled: boolean; message: string }) => {
        if (data.enabled && data.message) {
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: data.message,
            time: new Date(),
            sending: false,
          }]);
        } else {
          setMessages([]);
        }
      })
      .catch(() => setMessages([]));
  }, [currentTenantId, channelResolved, dynamicChannelId]);

  // 直接操作容器 scrollTop，比 scrollIntoView 在微信 WebView 里更可靠
  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 键盘弹起时滚到底部（不再动态设置容器高度，改用 fixed 底部栏方案）
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      requestAnimationFrame(() => scrollToBottom(false));
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

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

    // 不再插入「···」占位气泡，只先上屏用户消息
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const resp = await fetch("/api/wecom/web-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          channel_id: dynamicChannelId,
          user_id: meData?.id ? String(meData.id) : sessionId.current,
        }),
      });
      const data = await resp.json();
      // 只有在有有效回复时才追加 AI 消息；无回复则什么都不显示
      if (data.ok && data.reply) {
        const aiMsg: Message = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: data.reply,
          time: new Date(),
          sending: false,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch {
      /* 网络错误也不显示气泡 */
    } finally {
      setLoading(false);
    }
  }, [inputText, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.target as HTMLTextAreaElement;
    setInputText(ta.value);
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  };

  // ===== 录音按钮事件处理 =====
  const handleRecordStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setRecordState("recording");
    setRecordSecs(0);
    recordSecsRef.current = 0;
    // 每秒计时
    recordTimerRef.current = setInterval(() => {
      recordSecsRef.current += 1;
      setRecordSecs(recordSecsRef.current);
    }, 1000);
  };

  const handleRecordMove = (e: React.TouchEvent) => {
    if (recordState === "idle") return;
    const touch = e.touches[0];
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    // 获取屏幕宽度，判断手指位置
    const screenW = window.innerWidth;
    const x = touch.clientX;
    const y = touch.clientY;
    // 底部区域高度约 160px
    const bottomAreaTop = window.innerHeight - 160;
    if (y < bottomAreaTop) {
      // 手指滑出底部区域 → 取消
      setRecordState("cancel");
    } else if (x > screenW / 2) {
      // 右半区 → 转文字
      setRecordState("toText");
    } else {
      // 左半区或中间 → 正常录音
      setRecordState("recording");
    }
  };

  const handleRecordEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (recordState === "cancel") {
      stopTimer();
      setRecordState("idle");
      setRecordSecs(0);
      recordSecsRef.current = 0;
      return;
    }
    if (recordState === "toText") {
      stopTimer();
      setRecordState("idle");
      setRecordSecs(0);
      recordSecsRef.current = 0;
      return;
    }
    // 正常发送
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    const secs = Math.max(1, recordSecsRef.current);
    setRecordState("idle");
    setRecordSecs(0);
    const voiceMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: `[语音 ${secs}秒]`,
      isVoice: true,
      voiceSecs: secs,
      time: new Date(),
    };
    // 不插入「···」占位气泡，只上屏语音消息
    setMessages((prev) => [...prev, voiceMsg]);
    setLoading(true);
    fetch("/api/wecom/web-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "[用户发送了一条语音消息]",
        channel_id: dynamicChannelId,
        user_id: meData?.id ? String(meData.id) : sessionId.current,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.reply) {
          const aiMsg: Message = {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: data.reply,
            time: new Date(),
            sending: false,
          };
          setMessages((prev) => [...prev, aiMsg]);
        }
      })
      .catch(() => {/* 网络错误不显示气泡 */})
      .finally(() => setLoading(false));
  };

  const handleRecordCancel = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecordState("idle");
    setRecordSecs(0);
    recordSecsRef.current = 0;
  };

  // 取消时也要清计时器
  const stopTimer = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const isRecording = recordState !== "idle";

  return (
    <div
      className="flex flex-col select-none"
      style={{
        backgroundColor: "#ebebeb",
        fontFamily: "-apple-system, 'PingFang SC', sans-serif",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
      }}
    >
      {/* ===== 顶部导航栏 ===== */}
      <div
        className="flex items-center px-2 py-2 flex-shrink-0 relative"
        style={{
          backgroundColor: "#ededed",
          borderBottom: "0.5px solid #d0d0d0",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        <button
          className="flex items-center text-[#576B95] active:opacity-60 transition-opacity px-1 py-1 min-w-[44px]"
          onClick={() => navigate("/yaban")}
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <div className="text-[17px] font-medium text-gray-900 leading-tight">
            牙伴在线
          </div>
        </div>
        <button className="ml-auto text-gray-600 active:opacity-60 transition-opacity px-1 py-1 min-w-[44px] flex justify-end">
          <MoreHorizontal size={22} />
        </button>
      </div>

      {/* ===== 消息列表 ===== */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ backgroundColor: "#ebebeb", paddingBottom: "160px" }}
        onClick={() => { setShowExtra(false); inputRef.current?.blur(); }}
      >
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const showTime = shouldShowTime(msg, prev);
          const isLatestAi = msg.role === "assistant" && idx === messages.length - 1;

          return (
            <div key={msg.id}>
              {showTime && (
                <div className="text-center text-[15px] text-gray-400 my-3">
                  {formatTime(msg.time)}
                </div>
              )}
              <div className="mb-3">
                {msg.role === "assistant" ? (
                  <AiMessageBubble msg={msg} isLatest={isLatestAi} />
                ) : (
                  <UserMessageBubble msg={msg} userAvatar={userAvatar} />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== 底部输入栏（fixed定位，键盘弹起时自动贴键盘顶部）===== */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: "#f5f5f5",
          borderTop: "0.5px solid #d0d0d0",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
        }}
      >
        <div className="flex items-end px-2 py-[12px]" style={{ gap: 6 }}>
          {/* 语音/键盘切换按钮 */}
          <button
            className="flex-shrink-0 flex items-center justify-center text-gray-600 active:opacity-60"
            style={{ width: 44, height: 44 }}
            onClick={() => setIsVoiceMode((v) => !v)}
          >
            {isVoiceMode ? (
              /* 语音模式下显示：圆形外框 + 键盘（两排8个点+横杠） */
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="10" />
                <circle cx="7.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="10.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="13.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="16.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="7.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="10.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="13.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="16.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
                <line x1="7.5" y1="15.5" x2="16.5" y2="15.5" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              /* 文字模式下显示：麦克风图标 */
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" strokeLinecap="round" />
                <line x1="12" y1="19" x2="12" y2="22" strokeLinecap="round" />
                <line x1="9" y1="22" x2="15" y2="22" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* 输入框 / 按住说话 */}
          {isVoiceMode ? (
            <button
              className="flex-1 text-[18px] text-gray-700 transition-colors"
              style={{
                height: 44,
                backgroundColor: recordState === "cancel" ? "#ff4d4f" : recordState === "toText" ? "#07C160" : "#fff",
                border: "0.5px solid #d0d0d0",
                borderRadius: 4,
                color: isRecording ? "#fff" : "#333",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
              onTouchStart={handleRecordStart}
              onTouchMove={handleRecordMove}
              onTouchEnd={handleRecordEnd}
              onTouchCancel={handleRecordCancel}
              onMouseDown={handleRecordStart}
              onMouseUp={handleRecordEnd}
            >
              {isRecording
                ? recordState === "cancel"
                  ? "松开取消"
                  : recordState === "toText"
                  ? "松开转文字"
                  : `${recordSecs}" 松开发送`
                : "按住 说话"}
            </button>
          ) : (
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder=""
              rows={1}
              enterKeyHint="send"
              className="flex-1 px-3 py-2 text-[18px] text-gray-900 resize-none outline-none leading-[1.5] overflow-hidden"
              style={{
                backgroundColor: "#fff",
                border: "0.5px solid #d0d0d0",
                borderRadius: 4,
                minHeight: "44px",
                maxHeight: "120px",
              }}
            />
          )}

          {/* 右侧按钮组：笑脸 + 加号，始终显示（发送通过键盘 enterKeyHint=send 触发） */}
          <div className="flex items-end flex-shrink-0" style={{ gap: 0 }}>
            {/* 表情按钮：圆形边框 + 笑脸 */}
            <button
              className="flex items-center justify-center text-gray-600 active:opacity-60"
              style={{ width: 44, height: 44, marginRight: -7 }}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
                <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
                <path d="M8.5 14.5 Q12 17.5 15.5 14.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 加号按钮：始终显示 */}
            <button
              className="flex items-center justify-center text-gray-600 active:opacity-60"
              style={{ width: 44, height: 44 }}
              onClick={() => setShowExtra((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="7" x2="12" y2="17" strokeLinecap="round" />
                <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* 扩展面板 */}
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

      {/* ===== 录音全屏覆盖层（仿微信）===== */}
      {isRecording && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: "rgba(0,0,0,0.0)", pointerEvents: "none" }}
        >
          {/* 上半部分透明，不遮挡消息 */}
          <div className="flex-1" />

          {/* 底部录音操作区 */}
          <div
            style={{
              backgroundColor: "rgba(240,240,240,0.97)",
              paddingBottom: "env(safe-area-inset-bottom, 20px)",
            }}
          >
            {/* 声波显示区 */}
            <div
              className="mx-auto flex items-center justify-center"
              style={{
                margin: "16px auto",
                width: 200,
                height: 64,
                backgroundColor: "#C8F069",
                borderRadius: 12,
              }}
            >
              <SoundWave />
            </div>

            {/* 取消 / 转文字 两个区域 */}
            <div className="flex px-4 gap-3 mb-3">
              <div
                className="flex-1 flex items-center justify-center rounded-2xl"
                style={{
                  height: 56,
                  backgroundColor: recordState === "cancel" ? "#aaa" : "#d8d8d8",
                }}
              >
                <span
                  className="text-[17px] font-medium"
                  style={{ color: recordState === "cancel" ? "#fff" : "#333" }}
                >
                  取消
                </span>
              </div>
              <div
                className="flex-1 flex items-center justify-center rounded-2xl"
                style={{
                  height: 56,
                  backgroundColor: recordState === "toText" ? "#aaa" : "#d8d8d8",
                }}
              >
                <span
                  className="text-[17px] font-medium"
                  style={{ color: recordState === "toText" ? "#fff" : "#333" }}
                >
                  滑到这里 转文字
                </span>
              </div>
            </div>

            {/* 松开发送提示 */}
            <div
              className="flex items-center justify-center"
              style={{ height: 48, backgroundColor: "#e0e0e0" }}
            >
              <span className="text-[16px] text-gray-500">
                {recordState === "cancel"
                  ? "松开取消"
                  : recordState === "toText"
                  ? "松开转文字"
                  : "松开 发送"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
