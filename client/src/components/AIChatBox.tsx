import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Bot } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
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
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];
};

/**
 * A WeChat/DeepSeek style AI chat box component
 *
 * Features:
 * - WeChat-style message bubbles
 * - Clean, minimalist design
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "输入消息...",
  className,
  height = "600px",
  emptyStateMessage = "开始对话",
  suggestedPrompts,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
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

  return (
    <div
      className={cn(
        "flex flex-col bg-[#F5F5F5]",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Bot className="w-16 h-16" />
              <p className="text-sm">{emptyStateMessage}</p>
            </div>

            {suggestedPrompts && suggestedPrompts.length > 0 && (
              <div className="flex max-w-md flex-col gap-2 w-full px-4">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => onSendMessage(prompt)}
                    disabled={isLoading}
                    className="rounded-lg bg-white px-4 py-3 text-sm text-left shadow-sm hover:shadow-md transition-shadow disabled:cursor-not-allowed disabled:opacity-50 border border-gray-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4 pb-2">
            {displayMessages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-2 items-start",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                    message.role === "user"
                      ? "bg-[#A80000]"
                      : "bg-white border border-gray-200"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-[#A80000]" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 shadow-sm",
                    message.role === "user"
                      ? "bg-[#A80000] text-white rounded-tr-none"
                      : "bg-white text-gray-800 rounded-tl-none"
                  )}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none [&_p]:my-1 [&_pre]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                      <Streamdown>{message.content}</Streamdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-2 items-start">
                <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-[#A80000]" />
                </div>
                <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 p-3 bg-white border-t border-gray-200 items-end"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 max-h-24 resize-none min-h-[40px] bg-[#F5F5F5] border-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg px-3 py-2"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          className="shrink-0 h-10 w-10 bg-[#A80000] hover:bg-[#8B0000] rounded-lg"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </form>
    </div>
  );
}
