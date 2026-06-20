import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Bot, Play, Pause, Square,
  Clock, CheckCircle, AlertCircle, Loader2,
  Sparkles, Send, HelpCircle, ChevronDown, ChevronUp,
  Trash2, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const TASK_STATUS: Record<string, { label: string; color: string; bgColor: string; Icon: any }> = {
  draft:     { label: "草稿",   color: "#9E9E9E", bgColor: "#F5F5F5", Icon: AlertCircle },
  pending:   { label: "待确认", color: "#F57C00", bgColor: "#FFF3E0", Icon: Clock },
  running:   { label: "运行中", color: "#388E3C", bgColor: "#E8F5E9", Icon: Play },
  paused:    { label: "已暂停", color: "#F57C00", bgColor: "#FFF3E0", Icon: Pause },
  stopped:   { label: "已停止", color: "#9E9E9E", bgColor: "#F5F5F5", Icon: Square },
  completed: { label: "已完成", color: "#1976D2", bgColor: "#E3F2FD", Icon: CheckCircle },
};

const SCHEDULE_LABELS: Record<string, string> = {
  once: "一次性",
  every_minute: "每分钟",
  every_5_minutes: "每5分钟",
  every_10_minutes: "每10分钟",
  every_30_minutes: "每30分钟",
  every_hour: "每小时",
  daily: "每日",
  weekly: "每周",
  monthly: "每月",
};

function AIAvatar({ avatarUrl, name, size = 36 }: { avatarUrl?: string | null; name: string; size?: number }) {
  const initial = name.replace(/^AI/, "").charAt(0) || "A";
  const tagH = Math.max(12, size * 0.3);
  const tagFont = Math.max(7, size * 0.2);
  return (
    <div className="relative inline-block flex-shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold bg-gray-400" style={{ fontSize: size * 0.38 }}>
          {initial}
        </div>
      )}
      <div
        className="absolute left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#D32F2F] to-[#FF5252] text-white rounded-full flex items-center justify-center font-bold shadow"
        style={{ bottom: -tagH / 4, height: tagH, minWidth: tagH * 1.6, fontSize: tagFont, padding: "0 3px", lineHeight: 1, border: "1.5px solid white" }}
      >
        AI
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? "bg-[#D32F2F]" : "bg-gray-200"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function ChatBubble({ msg, userAvatar, userName, aiAvatar, aiName }: {
  msg: { role: string; content: string; created_at?: string };
  userAvatar?: string | null;
  userName: string;
  aiAvatar?: string | null;
  aiName: string;
}) {
  const isUser = msg.role === "user";
  const timeStr = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";

  if (isUser) {
    return (
      <div className="flex items-end gap-2 justify-end">
        <div className="flex flex-col items-end gap-1 max-w-[75%]">
          {timeStr && <span className="text-[10px] text-gray-400 px-1">{timeStr}</span>}
          <div className="bg-[#D32F2F] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap">
            {msg.content}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
              {userName.charAt(0)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 justify-start">
      <AIAvatar avatarUrl={aiAvatar} name={aiName} size={32} />
      <div className="flex flex-col items-start gap-1 max-w-[75%]">
        {timeStr && <span className="text-[10px] text-gray-400 px-1">{timeStr}</span>}
        <div className="bg-white text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm border border-gray-100 whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

const LedgerAIEmployees = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  const [messageInput, setMessageInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [localMessages, setLocalMessages] = useState<Array<{ role: string; content: string; created_at?: string }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: aiEmployees = [], refetch } = trpc.ledger.getAIEmployees.useQuery({ ledgerId });
  const { data: tasks = [], refetch: refetchTasks } = trpc.ledger.getAIEmployeeTasks.useQuery({ ledgerId });
  const { data: conversationHistory = [] } = trpc.ledger.getAIConversationHistory.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  useEffect(() => {
    if ((conversationHistory as any[]).length > 0 && localMessages.length === 0) {
      setLocalMessages(conversationHistory as any);
    }
  }, [conversationHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  // eslint-disable-next-line eqeqeq
  const myAI = (aiEmployees as any[]).find((e: any) => e.userId == currentUser?.id);
  const isEnabled = !!myAI;

  const toggleMutation = trpc.ledger.toggleAIEmployee.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.enabled ? "AI分身已开启" : "AI分身已关闭");
      refetch();
    },
    onError: (error: any) => { toast.error(error.message || "操作失败"); },
  });

  const chatMutation = trpc.ledger.chatWithAIEmployee.useMutation({
    onSuccess: (data: any) => {
      setLocalMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply,
        created_at: new Date().toISOString(),
      }]);
      if (data.taskCreated) {
        refetchTasks();
        toast.success("任务已创建");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "AI助理暂时无法响应，请稍后重试");
      setLocalMessages(prev => prev.slice(0, -1));
    },
  });

  const clearHistoryMutation = trpc.ledger.clearAIConversationHistory.useMutation({
    onSuccess: () => {
      setLocalMessages([]);
      toast.success("对话已清空");
    },
    onError: (error: any) => { toast.error(error.message || "清空失败"); },
  });

  const updateStatusMutation = trpc.ledger.updateAIEmployeeTaskStatus.useMutation({
    onSuccess: () => { toast.success("任务状态已更新"); refetchTasks(); },
    onError: (error: any) => { toast.error(error.message || "操作失败"); },
  });

  const handleToggle = (enabled: boolean) => {
    toggleMutation.mutate({ ledgerId, enabled });
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || chatMutation.isPending) return;
    const userMsg = messageInput.trim();
    setMessageInput("");
    setLocalMessages(prev => [...prev, {
      role: "user",
      content: userMsg,
      created_at: new Date().toISOString(),
    }]);
    chatMutation.mutate({ ledgerId, message: userMsg });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const displayName = myAI?.nickname || myAI?.username || currentUser?.username || "AI分身";
  const displayAvatar = myAI?.avatarUrl || (currentUser as any)?.avatar;
  const showWelcome = localMessages.length === 0;

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#D32F2F] to-[#B71C1C] text-white sticky top-0 z-10">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => setLocation(`/ledger/${id}/settings`)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="flex-1 text-center text-base font-medium">AI 分身</h1>
          <button onClick={() => setShowHelp(!showHelp)} className="p-2 -mr-2 text-white/80 hover:text-white">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 帮助说明 */}
      {showHelp && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D32F2F] to-[#FF5252] flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-800 mb-1">什么是 AI 分身？</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                AI 分身可以理解您的自然语言指令，自动帮您记账。支持补录历史账目、创建新分类、设置定期任务等。直接用中文描述需求，AI 会主动确认后再执行。
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-500">💬 "帮我记昨天的餐费50元"</p>
                <p className="text-xs text-gray-500">💬 "从上周一开始每天记一笔100元房租"</p>
                <p className="text-xs text-gray-500">💬 "帮我创建养生保健分类，记一笔300元"</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主开关 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D32F2F]" />
            <span className="text-sm font-semibold text-gray-900">我的 AI 分身</span>
            {isEnabled && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">运行中</span>}
          </div>
          <Toggle checked={isEnabled} onChange={handleToggle} disabled={toggleMutation.isPending} />
        </div>
      </div>

      {/* 对话区域 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm flex flex-col" style={{ minHeight: "320px" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AIAvatar avatarUrl={displayAvatar} name={displayName} size={28} />
            <span className="text-sm font-medium text-gray-800">{displayName}</span>
          </div>
          {localMessages.length > 0 && (
            <button
              onClick={() => clearHistoryMutation.mutate({ ledgerId })}
              disabled={clearHistoryMutation.isPending}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
          )}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: "400px" }}>
          {showWelcome ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D32F2F] to-[#FF5252] flex items-center justify-center mb-3 shadow-md">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">你好！我是你的 AI 分身</p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-[220px]">用自然语言告诉我你想记什么账，我来帮你处理</p>
              <div className="mt-4 space-y-2 w-full max-w-[260px]">
                {["帮我记昨天的餐费50元", "从上周一开始每天记100元房租", "帮我创建养生保健分类"].map((example) => (
                  <button
                    key={example}
                    onClick={() => setMessageInput(example)}
                    className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-red-50 hover:text-[#D32F2F] px-3 py-2 rounded-xl transition-colors border border-gray-100"
                  >
                    💬 {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {localMessages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  msg={msg}
                  userAvatar={displayAvatar}
                  userName={displayName}
                  aiAvatar={displayAvatar}
                  aiName={displayName}
                />
              ))}
              {chatMutation.isPending && (
                <div className="flex items-end gap-2 justify-start">
                  <AIAvatar avatarUrl={displayAvatar} name={displayName} size={32} />
                  <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* 输入框 */}
        <div className="px-3 pb-3 pt-2 border-t border-gray-100">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isEnabled ? "描述你想记的账..." : "请先开启 AI 分身"}
              disabled={!isEnabled || chatMutation.isPending}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D32F2F] focus:ring-1 focus:ring-[#D32F2F]/20 disabled:bg-gray-50 disabled:text-gray-400 leading-relaxed"
              style={{ maxHeight: "100px", overflowY: "auto" }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || !isEnabled || chatMutation.isPending}
              className="w-10 h-10 rounded-xl bg-[#D32F2F] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-opacity"
            >
              {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 px-1">按 Enter 发送，Shift+Enter 换行</p>
        </div>
      </div>

      {/* 任务日志区 */}
      <div className="mx-4 mt-3 mb-8 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">任务日志</h3>
            {(tasks as any[]).length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{(tasks as any[]).length}</span>
            )}
          </div>
          <button onClick={() => refetchTasks()} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {(tasks as any[]).length > 0 ? (
          <div className="divide-y divide-gray-50">
            {(tasks as any[]).map((task: any) => {
              const status = TASK_STATUS[task.status] || TASK_STATUS.draft;
              const StatusIcon = status.Icon;
              const isExpanded = expandedTaskId === task.id;
              let plan: any = null;
              try { plan = typeof task.parsed_plan === "string" ? JSON.parse(task.parsed_plan) : task.parsed_plan; } catch {}

              return (
                <div
                  key={task.id}
                  className="px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: status.bgColor }}>
                      <StatusIcon className="w-3.5 h-3.5" style={{ color: status.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: status.color, backgroundColor: status.bgColor }}>
                          {status.label}
                        </span>
                        {plan?.schedule_type && (
                          <span className="text-xs text-gray-400">{SCHEDULE_LABELS[plan.schedule_type] || plan.schedule_type}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 font-medium truncate">{plan?.summary || task.task_description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(task.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 ml-10 space-y-3">
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-400 mb-1">原始描述</p>
                        <p className="text-sm text-gray-700">{task.task_description}</p>
                      </div>
                      {plan?.actions && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5">执行动作</p>
                          {plan.actions.map((action: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                              <div className="w-4 h-4 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-[10px] flex-shrink-0">{i + 1}</div>
                              <span>
                                {action.transaction_type === "income" ? "收入" : "支出"}{" "}
                                {action.amount_min !== undefined && action.amount_max !== undefined
                                  ? `¥${action.amount_min}-${action.amount_max}（随机）`
                                  : `¥${action.amount}`}
                                {action.category_name ? ` · ${action.category_name}` : ""}
                                {action.record_date ? ` · ${action.record_date}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>创建：{new Date(task.created_at).toLocaleString("zh-CN")}</span>
                        {task.last_executed_at && <span>上次执行：{new Date(task.last_executed_at).toLocaleString("zh-CN")}</span>}
                      </div>
                      {(task.status === "running" || task.status === "paused") && (
                        <div className="flex gap-2 pt-1">
                          {task.status === "running" && (
                            <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ taskId: task.id, status: "paused" }); }} className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg">
                              <Pause className="w-3 h-3" /> 暂停
                            </button>
                          )}
                          {task.status === "paused" && (
                            <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ taskId: task.id, status: "running" }); }} className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                              <Play className="w-3 h-3" /> 继续
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ taskId: task.id, status: "stopped" }); }} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                            <Square className="w-3 h-3" /> 停止
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center">
            <Clock className="w-9 h-9 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">暂无任务记录</p>
            <p className="text-xs text-gray-300 mt-1">AI 执行任务后将在这里显示</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerAIEmployees;
