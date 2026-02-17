import { useState } from "react";
import { AIChatBox, Message } from "@/components/AIChatBox";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function AIChat() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "你是脉动应用的AI助手，可以帮助用户查询企业信息、管理人脉关系、解答问题等。"
    }
  ]);

  // AI查询mutation
  const aiQueryMutation = trpc.aiAssistant.query.useMutation({
    onSuccess: (response) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: response.answer
      }]);
    },
    onError: (error) => {
      toast.error(`AI助手出错: ${error.message}`);
      // 添加错误消息到聊天记录
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `抱歉，我遇到了一些问题：${error.message}`
      }]);
    }
  });

  const handleSendMessage = (content: string) => {
    // 添加用户消息到聊天记录
    setMessages(prev => [...prev, {
      role: "user",
      content
    }]);

    // 调用AI助手API
    aiQueryMutation.mutate({
      query: content,
      history: messages.filter(m => m.role !== "system") // 不发送system消息
    });
  };

  const suggestedPrompts = [
    "帮我查一下腾讯的企业信息",
    "查询阿里巴巴集团的公司详情",
    "搜索华为技术有限公司",
    "我的人脉网络有多少人？",
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部标题栏 */}
      <header className="bg-gradient-to-br from-[#A80000] to-[#d44] sticky top-0 z-10 shadow-sm">
        <div className="px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-white/80 text-sm px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-12">AI助手</h1>
        </div>
      </header>

      {/* 聊天区域 */}
      <div className="h-[calc(100vh-8rem)]">
        <AIChatBox
          messages={messages.filter(m => m.role !== "system")}
          onSendMessage={handleSendMessage}
          isLoading={aiQueryMutation.isPending}
          placeholder="输入消息，例如：帮我查一下腾讯"
          emptyStateMessage="👋 你好！我是脉动AI助手"
          suggestedPrompts={suggestedPrompts}
          height="100%"
        />
      </div>

      {/* 底部导航栏 */}
      <BottomNav />
    </div>
  );
}
