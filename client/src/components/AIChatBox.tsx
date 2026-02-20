import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Bot, Menu, X, MessageSquare, Plus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  tokensUsed?: number;
  cost?: number;
};

export type Session = {
  id: number;
  title: string;
  updated_at: string;
  message_count: number;
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   */
  onSendMessage: (content: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 100vh)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   */
  suggestedPrompts?: string[];

  /**
   * Current user's points balance
   */
  pointsBalance?: number;

  /**
   * Sessions list for history sidebar
   */
  sessions?: Session[];

  /**
   * Current session ID
   */
  currentSessionId?: number;

  /**
   * Callback when user selects a session from history
   */
  onSelectSession?: (sessionId: number) => void;

  /**
   * Callback when user creates a new session
   */
  onNewSession?: () => void;

  /**
   * Callback when user deletes a session
   */
  onDeleteSession?: (sessionId: number) => void;
};

/**
 * A full-screen AI chat box component (ChatGPT/Claude style)
 *
 * Features:
 * - Full-width messages without bubbles
 * - History sidebar with session management
 * - Points balance display
 * - Token usage tracking
 * - Markdown rendering with Streamdown
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "输入消息，例如：帮我查一下腾讯的企业信息",
  className,
  height = "100vh",
  emptyStateMessage = "👋 你好！我是脉动AI助手",
  suggestedPrompts,
  pointsBalance,
  sessions = [],
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestedPromptClick = (prompt: string) => {
    if (isLoading) return;
    onSendMessage(prompt);
  };

  return (
    <div
      className={cn(
        "flex h-screen bg-white overflow-hidden",
        className
      )}
      style={{ height }}
    >
      {/* History Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-gray-50 border-r border-[#E0E0E0] transform transition-transform duration-300 ease-in-out",
          showSidebar ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#E0E0E0]">
            <h2 className="text-sm font-semibold text-[#424242]">对话历史</h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-4 h-4 text-[#757575]" />
            </button>
          </div>

          {/* New Session Button */}
          <div className="p-3 border-b border-[#E0E0E0]">
            <button
              onClick={() => {
                onNewSession?.();
                setShowSidebar(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#424242] bg-white border border-[#E0E0E0] rounded-lg hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              新建对话
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#757575]">
                暂无历史对话
              </div>
            ) : (
              <div className="p-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "group relative mb-2 p-3 rounded-lg cursor-pointer hover:bg-white transition-colors",
                      currentSessionId === session.id ? "bg-white shadow-sm" : ""
                    )}
                    onClick={() => {
                      onSelectSession?.(session.id);
                      setShowSidebar(false);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-[#757575] flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#424242] truncate">
                          {session.title}
                        </p>
                        <p className="text-xs text-[#757575] mt-1">
                          {session.message_count} 条消息
                        </p>
                      </div>
                    </div>
                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession?.(session.id);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-[#FFEBEE] rounded transition-opacity"
                    >
                      <X className="w-3 h-3 text-[#D32F2F]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 h-full">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0E0E0] bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(true)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-[#757575]" />
            </button>
            <h1 className="text-sm font-semibold text-[#424242]">AI助手</h1>
          </div>

          {/* 积分功能已暂时禁用 */}
          {/* {pointsBalance !== undefined && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <span className="text-xs text-[#757575]">积分余额：</span>
              <span className="text-xs font-semibold text-[#A80000]">
                {pointsBalance.toFixed(2)}
              </span>
            </div>
          )} */}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
              <div className="flex flex-col items-center gap-3 text-[#757575]">
                <Bot className="w-16 h-16" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-col gap-2 w-full px-4">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedPromptClick(prompt)}
                      disabled={isLoading}
                      className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-left hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50 border border-[#E0E0E0]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full">
              {displayMessages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "py-6 px-4",
                    message.role === "user" ? "bg-white" : "bg-gray-50"
                  )}
                >
                  <div className="flex gap-4 items-start max-w-3xl mx-auto">
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        message.role === "user"
                          ? "bg-[#A80000]"
                          : "bg-white border-2 border-[#E0E0E0]"
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-[#A80000]" />
                      )}
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none text-sm text-[#424242] break-words">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-[#424242] leading-relaxed">
                          {message.content}
                        </p>
                      )}

                      {/* Token Usage */}
                      {message.tokensUsed && message.cost && (
                        <div className="mt-2 text-xs text-[#757575]">
                          消耗 {message.tokensUsed} tokens，扣除 {message.cost.toFixed(4)} 积分
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="py-6 px-4 bg-gray-50">
                  <div className="flex gap-4 items-start max-w-3xl mx-auto">
                    <div className="w-8 h-8 rounded-full bg-white border-2 border-[#E0E0E0] flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-[#A80000]" />
                    </div>
                    <div className="flex-1">
                      <Loader2 className="w-5 h-5 animate-spin text-[#757575]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#E0E0E0] bg-white">
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto w-full p-4"
          >
            <div className="flex gap-3 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="flex-1 max-h-32 resize-none min-h-[44px] bg-gray-50 border-[#E0E0E0] focus-visible:ring-1 focus-visible:ring-[#A80000] rounded-lg px-4 py-3 text-sm"
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="shrink-0 h-11 w-11 bg-[#A80000] hover:bg-[#8B0000] rounded-lg"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
