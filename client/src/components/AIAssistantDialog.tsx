import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Sparkles, User, Bot, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface AIAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AIAssistantDialog({ open, onOpenChange }: AIAssistantDialogProps) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const aiQueryMutation = trpc.aiAssistant.query.useMutation({
    onSuccess: (data) => {
      // 添加AI回复到消息列表
      setMessages((prev) => [...prev, { role: "assistant", content: data.result }]);
      setIsLoading(false);
    },
    onError: (error) => {
      toast.error("查询失败：" + error.message);
      setIsLoading(false);
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("请输入查询内容");
      return;
    }

    // 添加用户消息到列表
    const userMessage: Message = { role: "user", content: query.trim() };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);
    setQuery("");

    // 构建对话历史（只保留最近20轮，即40条消息）
    const history = messages.slice(-40).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 发送查询
    aiQueryMutation.mutate({
      query: userMessage.content,
      history,
    });
  };

  const handleClearHistory = () => {
    setMessages([]);
    toast.success("对话历史已清空");
  };

  const handleClose = () => {
    setQuery("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
        {/* 顶部标题 */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                AI智能助手
              </DialogTitle>
              <DialogDescription>
                用自然语言搜索、整理和汇总您的人脉信息
              </DialogDescription>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearHistory}
                className="text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                清空历史
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* 中间内容区域（可滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 示例查询（初始状态） */}
          {messages.length === 0 && !isLoading && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">💡 示例查询：</div>
              <div className="flex flex-wrap gap-2">
                {[
                  "帮我找出所有的银行卡号",
                  "哪些人在北京",
                  "谁在工商银行开户",
                  "列出所有重要客户",
                  "最近一个月联系过哪些人",
                ].map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery(example);
                    }}
                    className="text-xs"
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 对话消息列表 */}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
              )}
              <div
                className={`rounded-lg p-3 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-muted/50 border"
                }`}
              >
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {message.content}
                </div>
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
              )}
            </div>
          ))}

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div className="rounded-lg p-3 bg-muted/50 border">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-muted-foreground">AI正在思考...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入框（固定） */}
        <div className="border-t px-6 py-4 bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="你可以帮我添加一个人吗？嗯，名字叫张三..."
              className="flex-1"
              disabled={isLoading}
              autoFocus
            />
            <Button type="submit" disabled={isLoading} size="icon">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
